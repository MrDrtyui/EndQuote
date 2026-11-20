import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify'
import cookie from '@fastify/cookie'
import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto'
import argon2 from 'argon2'
import { z } from 'zod'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Prisma } from './generated/client.js'
import { onboard, owned, ownerView, profile,locked,entitled,missing } from './business.js'
import { workspace,conflict } from './workspace.js'
import multipart from '@fastify/multipart'
import {intake,type CommitClock} from './intake.js'

import {accounts} from './account.js'
import {newTotpSecret,encryptTotp,decryptTotp,verifyTotp,totpUri} from './admin-security.js'
import {social} from './social.js'

export const environment = z.object({
  APP_ORIGIN: z.url().refine(s => {
    const u = new URL(s)
    return u.origin === s && (u.protocol === 'https:' || (process.env.NODE_ENV !== 'production' &&
      u.protocol === 'http:' && ['127.0.0.1','localhost','[::1]'].includes(u.hostname)))
  }),
  SESSION_SECRET: z.string().regex(/^[a-f0-9]{64}$/i),
  ADMIN_TOTP_KEY: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  DATABASE_URL: z.url().regex(/^postgres(?:ql)?:\/\//),
  RESEND_API_KEY:z.string().optional(), MAIL_FROM:z.string().optional(),
  GOOGLE_CLIENT_ID:z.string().optional(), GOOGLE_CLIENT_SECRET:z.string().optional(),
  APPLE_CLIENT_ID:z.string().optional(), APPLE_CLIENT_SECRET:z.string().optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  TRUSTED_PROXY_IP:z.union([z.ipv4(),z.ipv6()]).optional(),
})
export class Problem extends Error {
  constructor(readonly status: number, readonly code: string, message: string,readonly fields?:unknown) { super(message) }
}
export const digest = (s: string) => createHash('sha256').update(s).digest('hex')
export const random = () => randomBytes(32).toString('hex')
const credentials = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  password: z.string().min(12).max(128),
})
export async function makeApp(config: z.infer<typeof environment>,clock:CommitClock={now:()=>new Date()}) {
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: config.DATABASE_URL, max: 12 }) })
  const app = Fastify({ logger: false, bodyLimit: 128 * 1024, trustProxy: config.TRUSTED_PROXY_IP??false,requestTimeout:60_000 })
  const secure = config.APP_ORIGIN.startsWith('https:')
  const name = (s: string) => (secure ? '__Host-' : '') + 'eq-' + s
  const options = { secure, httpOnly: true, sameSite: 'lax' as const, path: '/' }
  const mac = (s: string) => createHmac('sha256', config.SESSION_SECRET).update(s).digest('hex')
  const dummy = await argon2.hash(random(), { type: argon2.argon2id })
  await app.register(cookie)
  await app.register(multipart)
  app.addHook('onClose', () => db.$disconnect())
  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Request-Id',req.id).header('Cache-Control','no-store').header('X-Content-Type-Options','nosniff').header('Referrer-Policy','same-origin').header('X-Frame-Options','SAMEORIGIN')
    if (req.headers.host !== new URL(config.APP_ORIGIN).host) throw new Problem(400,'HOST','Недопустимый адрес.')
    if (req.method === 'POST' && req.routeOptions.url === '/api/auth/social/apple/callback') {
      if (req.headers.origin !== 'https://appleid.apple.com' || req.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded') throw new Problem(403,'ORIGIN','Некорректный ответ Apple.')
      return
    }
    if (!['GET','HEAD'].includes(req.method)) {
      if (req.headers.origin !== config.APP_ORIGIN) throw new Problem(403,'ORIGIN','Недопустимый источник.')
      const upload=req.routeOptions.url==='/api/owner/logo'||req.routeOptions.url==='/api/public/:slug/uploads'
      if (req.headers['content-type']?.split(';')[0] !== (upload?'multipart/form-data':'application/json'))
        throw new Problem(415,'CONTENT_TYPE','Ожидается JSON.')
    }
  })
  app.setErrorHandler((err: Error & {statusCode?:number}, _req, reply) => {
    const p = err instanceof Problem ? err : err instanceof z.ZodError || err.statusCode === 400 ?
      new Problem(400,'INVALID','Проверьте введённые данные.') :
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' ?
        new Problem(409,'CONFLICT','Это значение уже используется.') :
      err.statusCode === 413 ? new Problem(413,'TOO_LARGE','Слишком большой запрос.') :
        new Problem(503,'UNAVAILABLE','Сервис временно недоступен.')
    reply.code(p.status).send({error:{code:p.code,message:p.message,...p.fields!==undefined&&{fields:p.fields}}})
  })
  function csrf(req: FastifyRequest, scope = 'owner') {
    const token = req.cookies[name(scope)] ?? req.cookies[name(scope+'-challenge')]
    const header = req.headers['x-csrf-token']
    if (!token || typeof header !== 'string' || !/^[0-9a-f]{64}$/.test(header) ||
      !timingSafeEqual(Buffer.from(mac(scope+token)),Buffer.from(header))) throw new Problem(403,'CSRF','Обновите страницу.')
  }
  function challenge(req: FastifyRequest, reply: FastifyReply, scope = 'owner') {
    const token = req.cookies[name(scope)] ?? random()
    if (!req.cookies[name(scope)]) reply.setCookie(name(scope+'-challenge'),token,{...options,maxAge:900})
    return mac(scope+token)
  }
  async function rate(label: string, limit: number, reply: FastifyReply) {
    const key = mac(label), expires = new Date(Date.now()+900_000)
    await db.rateBucket.deleteMany({where:{expiresAt:{lte:new Date()}}})
    const bucket = await db.rateBucket.upsert({where:{key},create:{key,hits:1,expiresAt:expires},update:{hits:{increment:1}}})
    if (bucket.hits > limit) {
      reply.header('Retry-After',String(Math.max(1,Math.ceil((+bucket.expiresAt-Date.now())/1000))))
      throw new Problem(429,'RATE_LIMIT','Попробуйте позже.')
    }
  }
  async function identity(req: FastifyRequest) {
    const token = req.cookies[name('owner')]
    if (!token) return null
    const now = new Date()
    const where = {tokenHash:digest(token),revokedAt:null,idleExpiresAt:{gt:now},absoluteExpiresAt:{gt:now}}
    const updated = await db.ownerSession.updateMany({where,data:{idleExpiresAt:new Date(+now+3600_000)}})
    if (!updated.count) return null
    return (await db.ownerSession.findUnique({where:{tokenHash:where.tokenHash},select:{owner:{select:{id:true,normalizedEmail:true,verifiedAt:true}}}}))?.owner ?? null
  }
  async function issue(ownerId: string, req: FastifyRequest, reply: FastifyReply, expectedHash:string, socialIdentity?:{provider:string;subject:string}) {
    const old = req.cookies[name('owner')], token = random()
    await db.$transaction(async tx=>{
      const [owner]=await tx.$queryRaw<{passwordHash:string}[]>`SELECT "passwordHash" FROM "Owner" WHERE id=${ownerId}::uuid FOR UPDATE`
      if(owner?.passwordHash!==expectedHash)throw conflict()
      if(socialIdentity && !await tx.providerIdentity.count({where:{...socialIdentity,ownerId}}))throw conflict()
      await tx.ownerSession.updateMany({where:{tokenHash:digest(old ?? ''),revokedAt:null},data:{revokedAt:new Date()}})
      await tx.ownerSession.create({data:{ownerId,tokenHash:digest(token),idleExpiresAt:new Date(Date.now()+3600_000),absoluteExpiresAt:new Date(Date.now()+7*86400_000)}})
    })
    reply.setCookie(name('owner'),token,{...options,maxAge:7*86400}).clearCookie(name('owner-challenge'),options)
    return mac('owner'+token)
  }
  app.get('/api/auth/session',async (req,reply) => {
    const owner = await identity(req)
    return {owner,providers:providers(),mailReady:mail.mailReady,onboarded:owner ? Boolean(await db.business.count({where:{ownerId:owner.id}})) : false,csrf:challenge(req,reply)}
  })
  async function ownerId(req: FastifyRequest) {
    if(req.method !== 'GET') csrf(req)
    const owner=await identity(req)
    if(!owner) throw new Problem(401,'AUTH','Войдите в кабинет.')
    return owner.id
  }
  app.post('/api/owner/business',async(req,reply)=>{
    const b=await onboard(db,await ownerId(req),profile.parse(req.body))
    return reply.code(201).send(ownerView(b))
  })
  app.get('/api/owner/storefront-status/:slug',async req=>{
    const id = await ownerId(req)
    const {slug} = z.object({slug:z.string()}).parse(req.params)
    const business = await db.business.findFirst({where:{ownerId:id,slug}})
    if (!business) throw missing()
    if (!entitled(business,clock.now())) {
      const trial = business.accessState === 'trial'
      return {kind:'expired', name:business.name, trial, endedAt:trial ? business.trialEndsAt : business.paidThrough}
    }
    return business.published ? {kind:'open'} : {kind:'unpublished',name:business.name}
  })
  app.get('/api/owner/profile',async req=>ownerView(await owned(db,await ownerId(req))))
  const ctx={db,config,csrf,ownerId,rate,issue,name,mac}
  const mail=accounts(app,ctx)
  const providers=social(app,ctx)
  async function businessAccess(req:FastifyRequest){
    const id=await ownerId(req)
    if(req.method!=='GET' || req.routeOptions.url?.startsWith('/api/owner/orders') || req.routeOptions.url==='/api/owner/photos/:id'){
      const owner=await db.owner.findUniqueOrThrow({where:{id}})
      if(!owner.verifiedAt)throw new Problem(403,'VERIFY','Подтвердите почту в настройках аккаунта.')
    }
    return id
  }
  workspace(app,db,businessAccess)
  const files=intake(app,db,mac,options,businessAccess,rate,clock)
  app.get('/readyz',async()=>{await db.$queryRaw`SELECT 1`;await files.ready();return {ok:true}})
  // Separate, limited admin sessions are never interchangeable with owner sessions.
  // Every admin API requires an enrolled TOTP and a completed second factor.
  const adminKey=name('admin')
  const adminCode=z.strictObject({code:z.string().regex(/^[0-9]{6}$/)})
  const adminChange=z.strictObject({
    expectedVersion:z.number().int().positive(),
    state:z.enum(['trial','active','expired','suspended']),
    endsAt:z.iso.datetime().nullable(),
    reason:z.string().trim().min(5).max(300)
  })
  const mfaKey=()=>{
    if(!config.ADMIN_TOTP_KEY)throw new Problem(503,'MFA_CONFIG','Настройте ADMIN_TOTP_KEY на сервере.')
    return config.ADMIN_TOTP_KEY
  }
  async function pendingAdmin(req:FastifyRequest){
    if(req.method!=='GET')csrf(req,'admin')
    const key=digest(req.cookies[adminKey]??'')
    const now=new Date()
    const row=await db.adminSession.findUnique({where:{tokenHash:key},include:{admin:true}})
    if(!row || row.idleExpiresAt<=now || row.absoluteExpiresAt<=now)
      throw new Problem(401,'AUTH','Войдите как администратор.')
    const touched=await db.adminSession.updateMany({
      where:{tokenHash:key,idleExpiresAt:{gt:now},absoluteExpiresAt:{gt:now}},
      data:{idleExpiresAt:new Date(+now+1800_000)}
    })
    if(!touched.count)throw new Problem(401,'AUTH','Сеанс завершён.')
    return row
  }
  async function admin(req:FastifyRequest){
    const session=await pendingAdmin(req)
    if(!session.mfaAt||!session.admin.totpEnabledAt)
      throw new Problem(403,'MFA_REQUIRED','Подтвердите вход одноразовым кодом.')
    return session
  }
  async function adminRecent(req:FastifyRequest){
    const session=await admin(req)
    if(!session.reauthAt || +session.reauthAt<Date.now()-5*60_000)
      throw new Problem(403,'REAUTH','Для изменения подписки повторно подтвердите личность.')
    return session
  }
  async function consumeCode(tx:Prisma.TransactionClient,a:{
    id:string;totpCiphertext:string|null;lastTotpStep:number|null
  },code:string){
    if(!a.totpCiphertext)return false
    const step=verifyTotp(decryptTotp(a.totpCiphertext,mfaKey()),code,Date.now(),a.lastTotpStep??-1)
    if(step===null)return false
    const updated=await tx.platformAdmin.updateMany({
      where:{id:a.id,OR:[{lastTotpStep:null},{lastTotpStep:{lt:step}}]},
      data:{lastTotpStep:step}
    })
    return updated.count===1
  }
  function adminStage(session:Awaited<ReturnType<typeof pendingAdmin>>|null){
    if(!session)return 'login'
    if(!session.admin.totpEnabledAt)return 'setup'
    return session.mfaAt?'ready':'verify'
  }
  app.get('/api/admin/session',async(req,reply)=>{
    let session:Awaited<ReturnType<typeof pendingAdmin>>|null=null
    try{session=await pendingAdmin(req)}catch(e){
      if(!(e instanceof Problem&&e.status===401))throw e
    }
    return {
      stage:adminStage(session),authenticated:adminStage(session)==='ready',
      email:session?.admin.email??null,mfaReady:Boolean(config.ADMIN_TOTP_KEY),
      csrf:challenge(req,reply,'admin')
    }
  })
  app.post('/api/admin/login',async(req,reply)=>{
    csrf(req,'admin')
    const d=credentials.parse(req.body)
    await rate('admin-ip:'+req.ip,15,reply)
    await rate('admin-login:'+d.email,5,reply)
    const a=await db.platformAdmin.findUnique({where:{email:d.email}})
    if(!await argon2.verify(a?.passwordHash??dummy,d.password)||!a)
      throw new Problem(401,'LOGIN','Неверная почта или пароль.')
    const token=random()
    await db.$transaction([
      db.adminSession.deleteMany({where:{tokenHash:digest(req.cookies[adminKey]??'')}}),
      db.adminSession.create({data:{
        tokenHash:digest(token),adminId:a.id,
        idleExpiresAt:new Date(Date.now()+1800_000),
        absoluteExpiresAt:new Date(Date.now()+8*3600_000)
      }})
    ])
    reply.setCookie(adminKey,token,{...options,maxAge:8*3600})
      .clearCookie(name('admin-challenge'),options)
    return {stage:a.totpEnabledAt?'verify':'setup',csrf:mac('admin'+token)}
  })
  app.post('/api/admin/mfa/setup',async req=>{
    const session=await pendingAdmin(req)
    if(session.admin.totpEnabledAt)throw new Problem(409,'MFA_ALREADY','Двухфакторная защита включена.')
    const secret=newTotpSecret()
    await db.platformAdmin.update({
      where:{id:session.adminId},data:{totpPending:encryptTotp(secret,mfaKey())}
    })
    return {secret,uri:totpUri(session.admin.email,secret)}
  })
  app.post('/api/admin/mfa/activate',async req=>{
    const session=await pendingAdmin(req)
    const {code}=adminCode.parse(req.body)
    const a=await db.platformAdmin.findUniqueOrThrow({where:{id:session.adminId}})
    if(a.totpEnabledAt||!a.totpPending)throw new Problem(409,'MFA_SETUP','Начните настройку заново.')
    const step=verifyTotp(decryptTotp(a.totpPending,mfaKey()),code)
    if(step===null)throw new Problem(401,'MFA_CODE','Неверный код подтверждения.')
    const now=new Date()
    await db.$transaction(async tx=>{
      const updated=await tx.platformAdmin.updateMany({
        where:{id:a.id,totpEnabledAt:null,totpPending:a.totpPending},
        data:{totpCiphertext:a.totpPending,totpPending:null,totpEnabledAt:now,lastTotpStep:step}
      })
      if(!updated.count)throw new Problem(409,'CONFLICT','Настройка уже изменилась.')
      await tx.adminSession.update({
        where:{tokenHash:session.tokenHash},data:{mfaAt:now,reauthAt:now}
      })
    })
    return {enabled:true}
  })
  app.post('/api/admin/mfa/verify',async req=>{
    const session=await pendingAdmin(req)
    const {code}=adminCode.parse(req.body)
    if(!session.admin.totpEnabledAt)throw new Problem(409,'MFA_SETUP','Сначала включите защиту.')
    await rate('admin-mfa:'+session.adminId,12,{header:()=>{}} as FastifyReply)
    const now=new Date()
    await db.$transaction(async tx=>{
      const a=await tx.platformAdmin.findUniqueOrThrow({where:{id:session.adminId}})
      if(!await consumeCode(tx,a,code))throw new Problem(401,'MFA_CODE','Неверный или использованный код.')
      await tx.adminSession.update({
        where:{tokenHash:session.tokenHash},data:{mfaAt:now,reauthAt:now}
      })
    })
    return {verified:true}
  })
  app.post('/api/admin/reauth',async(req,reply)=>{
    const session=await admin(req)
    const d=z.strictObject({password:z.string().min(1),code:z.string().regex(/^[0-9]{6}$/)}).parse(req.body)
    await rate('admin-reauth:'+session.adminId,8,reply)
    if(!await argon2.verify(session.admin.passwordHash,d.password))
      throw new Problem(401,'REAUTH_FAILED','Неверные данные подтверждения.')
    await db.$transaction(async tx=>{
      const a=await tx.platformAdmin.findUniqueOrThrow({where:{id:session.adminId}})
      if(!await consumeCode(tx,a,d.code))
        throw new Problem(401,'REAUTH_FAILED','Неверный или использованный одноразовый код.')
      await tx.adminSession.update({
        where:{tokenHash:session.tokenHash},data:{reauthAt:new Date()}
      })
    })
    return {confirmed:true}
  })
  app.post('/api/admin/logout',async(req,reply)=>{
    const session=await pendingAdmin(req)
    z.strictObject({}).parse(req.body)
    await db.adminSession.deleteMany({where:{tokenHash:session.tokenHash}})
    reply.clearCookie(adminKey,options).code(204).send()
  })
  const businessSelect={
    id:true,name:true,slug:true,city:true,published:true,
    accessState:true,accessVersion:true,trialEndsAt:true,paidThrough:true,
    owner:{select:{normalizedEmail:true,createdAt:true}}
  } as const
  const statusOf=(b:{accessState:string;trialEndsAt:Date;paidThrough:Date|null},now=new Date())=>
    b.accessState==='suspended'?'suspended':
    b.accessState==='trial'&&b.trialEndsAt>now?'trial':
    b.accessState==='active'&&(!b.paidThrough||b.paidThrough>now)?'active':'expired'
  const liveFilter=(state:string,now:Date):Prisma.BusinessWhereInput=>
    state==='trial'?{accessState:'trial',trialEndsAt:{gt:now}}:
    state==='active'?{accessState:'active',OR:[{paidThrough:null},{paidThrough:{gt:now}}]}:
    state==='suspended'?{accessState:'suspended'}:
    {OR:[{accessState:'expired'},{accessState:'trial',trialEndsAt:{lte:now}},{accessState:'active',paidThrough:{lte:now}}]}
  app.get('/api/admin/overview',async req=>{
    await admin(req)
    const now=new Date()
    const [total,trial,active,expired,suspended,newBusinesses,recent]=await Promise.all([
      db.business.count(),
      db.business.count({where:liveFilter('trial',now)}),
      db.business.count({where:liveFilter('active',now)}),
      db.business.count({where:liveFilter('expired',now)}),
      db.business.count({where:liveFilter('suspended',now)}),
      db.business.count({where:{owner:{is:{createdAt:{gte:new Date(+now-30*86400_000)}}}}}),
      db.business.findMany({take:8,orderBy:{owner:{createdAt:'desc'}},select:businessSelect})
    ])
    return {total,trial,active,expired,suspended,newBusinesses,
      recent:recent.map(b=>({...b,status:statusOf(b,now)}))}
  })
  app.get('/api/admin/businesses',async req=>{
    await admin(req)
    const {cursor,q,state}=z.strictObject({
      cursor:z.uuid().optional(),q:z.string().trim().max(120).optional(),
      state:z.enum(['all','trial','active','expired','suspended']).default('all')
    }).parse(req.query)
    const now=new Date()
    const where:Prisma.BusinessWhereInput={AND:[
      ...(state==='all'?[]:[liveFilter(state,now)]),
      ...(q?[{OR:[
        {name:{contains:q,mode:'insensitive'}},
        {slug:{contains:q,mode:'insensitive'}},
        {owner:{is:{normalizedEmail:{contains:q,mode:'insensitive'}}}}
      ]}]:[])
    ]}
    const rows=await db.business.findMany({
      where,cursor:cursor?{id:cursor}:undefined,skip:cursor?1:0,
      orderBy:{id:'asc'},take:26,select:businessSelect
    })
    return {rows:rows.slice(0,25).map(b=>({...b,status:statusOf(b,now)})),
      cursor:rows.length>25?rows[24].id:null}
  })
  app.get('/api/admin/businesses/:id',async req=>{
    await admin(req)
    const {id}=z.strictObject({id:z.uuid()}).parse(req.params)
    const business=await db.business.findUnique({where:{id},select:businessSelect})
    if(!business)throw missing()
    const audits=await db.accessAudit.findMany({
      where:{businessId:id},orderBy:{createdAt:'desc'},take:30,
      select:{id:true,createdAt:true,reason:true,prior:true,next:true,
        admin:{select:{email:true}}}
    })
    return {business:{...business,status:statusOf(business)},audits}
  })
  app.get('/api/admin/activity',async req=>{
    await admin(req)
    const {cursor}=z.strictObject({cursor:z.uuid().optional()}).parse(req.query)
    const rows=await db.accessAudit.findMany({
      cursor:cursor?{id:cursor}:undefined,skip:cursor?1:0,
      orderBy:[{createdAt:'desc'},{id:'desc'}],take:26,
      select:{id:true,createdAt:true,reason:true,prior:true,next:true,
        admin:{select:{email:true}},business:{select:{id:true,name:true}}}
    })
    return {rows:rows.slice(0,25),cursor:rows.length>25?rows[24].id:null}
  })
  app.patch('/api/admin/businesses/:id/access',async req=>{
    const session=await adminRecent(req)
    const {id}=z.strictObject({id:z.uuid()}).parse(req.params)
    const d=adminChange.parse(req.body)
    const end=d.endsAt?new Date(d.endsAt):null
    if(d.state==='trial'&&!end || end && ['trial','active'].includes(d.state) && end<=new Date()
      || ['expired','suspended'].includes(d.state)&&end)
      throw new Problem(400,'DATE','Проверьте срок и статус подписки.')
    return db.$transaction(async tx=>{
      const b=await locked(tx,id)
      if(b.accessVersion!==d.expectedVersion)throw conflict()
      const next=await tx.business.update({where:{id},data:{
        accessVersion:{increment:1},accessState:d.state,
        paidThrough:d.state==='active'?end:null,
        trialEndsAt:d.state==='trial'?end!:undefined
      }})
      const snapshot=(v:typeof b)=>({
        state:v.accessState,version:v.accessVersion,
        trial:v.trialEndsAt.toISOString(),paid:v.paidThrough?.toISOString()??null
      })
      await tx.accessAudit.create({data:{
        businessId:id,adminId:session.adminId,reason:d.reason,prior:snapshot(b),next:snapshot(next)
      }})
      return snapshot(next)
    })
  })
  for (const mode of ['register','login'] as const) app.post('/api/auth/'+mode,async (req,reply) => {
    csrf(req)
    await rate(mode+':ip:'+req.ip,30,reply)
    const {email,password} = credentials.parse(req.body)
    await rate(mode+':account:'+email,5,reply)
    let owner
    let verificationDelivery: string | undefined
    if (mode === 'register') {
      owner = await db.owner.create({data:{normalizedEmail:email,passwordHash:await argon2.hash(password,{type:argon2.argon2id})}})
      try { await mail.send(owner,'verify'); verificationDelivery='accepted' }
      catch { verificationDelivery='unavailable'; if(mail.mailReady) console.error('EndQuote registration email unavailable') }
      reply.code(201)
    } else {
      owner = await db.owner.findUnique({where:{normalizedEmail:email}})
      if (!await argon2.verify(owner?.passwordHash ?? dummy,password) || !owner?.hasPassword) throw new Problem(401,'LOGIN','Неверная почта или пароль.')
      await db.rateBucket.deleteMany({where:{key:mac(mode+':account:'+email)}})
    }
    return {verificationDelivery,owner:{id:owner.id,normalizedEmail:email},csrf:await issue(owner.id,req,reply,owner.passwordHash)}
  })
  app.post('/api/auth/logout',async (req,reply) => {
    csrf(req)
    z.strictObject({}).parse(req.body)
    await db.ownerSession.updateMany({where:{tokenHash:digest(req.cookies[name('owner')] ?? '')},data:{revokedAt:new Date()}})
    reply.clearCookie(name('owner'),options).code(204).send()
  })
  return {app,db}
}
