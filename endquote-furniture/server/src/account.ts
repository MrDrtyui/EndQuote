import { z } from 'zod'
import argon2 from 'argon2'
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import type { Owner, PrismaClient, Prisma } from './generated/client.js'
import { random, digest, Problem, environment } from './app.js'

export type AuthContext = {
  db: PrismaClient
  config: z.infer<typeof environment>
  csrf(req: FastifyRequest): void
  ownerId(req: FastifyRequest): Promise<string>
  rate(label: string, limit: number, reply: FastifyReply): Promise<void>
  issue(id: string, req: FastifyRequest, reply: FastifyReply, hash: string, identity?:{provider:string;subject:string}): Promise<string>
  name(key: string): string
  mac(input: string): string
}
export const emailAddress = z.string().trim().toLowerCase().pipe(z.email().max(254))
const newPassword = z.string().min(12).max(128)
const badLink = () => new Problem(400,'LINK','Ссылка устарела или уже использована. Запросите новое письмо.')
const unavailable = () => new Problem(503,'MAIL','Отправка писем временно недоступна. Попробуйте позже.')
export async function lockOwner(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "Owner" WHERE id = ${id}::uuid FOR UPDATE`
  return tx.owner.findUniqueOrThrow({where:{id}})
}
export function accounts(app: FastifyInstance, ctx: AuthContext) {
  const { db, config, ownerId, csrf, rate, issue } = ctx
  const mailReady = Boolean(config.RESEND_API_KEY && config.MAIL_FROM)
  async function send(owner: Owner, purpose: 'verify'|'change'|'reset', email = owner.normalizedEmail) {
    if (!mailReady) throw unavailable()
    const token = random(), hash = digest(token)
    await db.$transaction(async tx => {
      const current = await lockOwner(tx, owner.id)
      if (current.normalizedEmail !== owner.normalizedEmail || owner.passwordHash !== current.passwordHash) throw badLink()
      const data = {hash, email, expiresAt:new Date(Date.now() + (purpose === 'reset' ? 30 : 60) * 60000)}
      await tx.mailToken.upsert({where:{ownerId_purpose:{ownerId:owner.id,purpose}},create:{ownerId:owner.id,purpose,...data},update:data})
    })
    const subject = purpose === 'reset' ? 'Установите новый пароль' : 'Подтвердите электронную почту'
    const link = config.APP_ORIGIN + '/owner/' + (purpose === 'reset' ? 'reset' : 'verify') + '#' + token
    try {
      const response = await fetch('https://api.resend.com/emails',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
        headers:{Authorization:'Bearer '+config.RESEND_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({from:config.MAIL_FROM,to:[email],subject:subject+' · EndQuote',
          text:subject+' в EndQuote по ссылке:\n'+link+'\n\nЕсли вы не запрашивали это действие, проигнорируйте письмо.'})})
      if (!response.ok || !(await response.json()).id) throw unavailable()
    } catch {
      await db.mailToken.deleteMany({where:{hash}})
      throw unavailable()
    }
  }
  const getOwner = async (req: FastifyRequest) => db.owner.findUniqueOrThrow({where:{id:await ownerId(req)}})
  app.get('/api/owner/account', async req => {
    const owner = await getOwner(req)
    const [pending, identities] = await Promise.all([
      db.mailToken.findFirst({where:{ownerId:owner.id,purpose:'change',expiresAt:{gt:new Date()}}}),
      db.providerIdentity.findMany({where:{ownerId:owner.id},select:{provider:true}})
    ])
    return {email:owner.normalizedEmail,verified:!!owner.verifiedAt,createdAt:owner.createdAt,hasPassword:owner.hasPassword,
      pending:pending?.email,linked:identities.map(x=>x.provider),mailReady}
  })
  app.post('/api/owner/verify',async(req,reply)=>{
    const owner = await getOwner(req)
    await rate('verify:'+owner.id,3,reply)
    if (!owner.verifiedAt) await send(owner,'verify')
    return {ok:true}
  })
  app.patch('/api/owner/account',async(req,reply)=>{
    const owner = await getOwner(req)
    await rate('account:'+owner.id,8,reply)
    const { currentPassword, email, password } = z.strictObject({currentPassword:z.string().min(1).max(128),
      email:emailAddress.optional(),password:newPassword.optional()}).refine(x=>Boolean(x.email)!==Boolean(x.password)).parse(req.body)
    if (!owner.hasPassword || !await argon2.verify(owner.passwordHash,currentPassword)) throw new Problem(403,'PASSWORD','Неверный текущий пароль.')
    if (email) {
      if (email===owner.normalizedEmail) throw new Problem(400,'EMAIL','Введите другой адрес.')
      await send(owner,'change',email)
      return {ok:true}
    }
    const passwordHash = await argon2.hash(password!,{type:argon2.argon2id})
    await db.$transaction(async tx=>{
      const current = await lockOwner(tx,owner.id)
      if(current.passwordHash!==owner.passwordHash) throw badLink()
      await tx.owner.update({where:{id:owner.id},data:{passwordHash}})
      await tx.mailToken.deleteMany({where:{ownerId:owner.id}})
      await tx.ownerSession.updateMany({where:{ownerId:owner.id,revokedAt:null},data:{revokedAt:new Date()}})
    })
    return {csrf:await issue(owner.id,req,reply,passwordHash)}
  })
  app.post('/api/auth/recover',async(req,reply)=>{
    csrf(req)
    const {email}=z.strictObject({email:emailAddress}).parse(req.body)
    await rate('recover-ip:'+req.ip,20,reply)
    await rate('recover-address:'+email,3,reply)
    if (!mailReady) throw unavailable()
    // Delivery is independent of the public response, including provider latency and failures.
    void db.owner.findUnique({where:{normalizedEmail:email}}).then(owner=>owner && send(owner,'reset')).catch(()=>{
      console.error('EndQuote password recovery delivery failed')
    })
    return reply.code(202).send({ok:true})
  })
  app.post('/api/auth/confirm',async(req,reply)=>{
    csrf(req)
    await rate('confirm:'+req.ip,40,reply)
    const {token,password}=z.strictObject({token:z.string().regex(/^[a-f0-9]{64}$/),password:newPassword.optional()}).parse(req.body)
    const hash=digest(token)
    const row=await db.mailToken.findUnique({where:{hash}})
    if(!row || row.expiresAt<=new Date() || (row.purpose==='reset')!==Boolean(password)) throw badLink()
    const passwordHash=password ? await argon2.hash(password,{type:argon2.argon2id}) : undefined
    await db.$transaction(async tx=>{
      const current=await lockOwner(tx,row.ownerId)
      if(!(await tx.mailToken.deleteMany({where:{hash,expiresAt:{gt:new Date()}}})).count) throw badLink()
      if(row.purpose!=='change' && current.normalizedEmail!==row.email) throw badLink()
      await tx.owner.update({where:{id:current.id},data:{normalizedEmail:row.email,verifiedAt:new Date(),
        ...(passwordHash && {passwordHash,hasPassword:true})}})
      await tx.mailToken.deleteMany({where:{ownerId:current.id}})
      if(row.purpose!=='verify') await tx.ownerSession.updateMany({where:{ownerId:current.id,revokedAt:null},data:{revokedAt:new Date()}})
    })
    return {ok:true}
  })
  return {send,mailReady}
}
