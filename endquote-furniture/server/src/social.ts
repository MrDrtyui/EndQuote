import {createHash} from 'node:crypto'
import {createRemoteJWKSet, jwtVerify, decodeJwt} from 'jose'
import argon2 from 'argon2'
import {z} from 'zod'
import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify'
import {random,digest,Problem} from './app.js'
import {lockOwner,emailAddress,type AuthContext} from './account.js'

const providers = {
  google:{issuer:'https://accounts.google.com',authorize:'https://accounts.google.com/o/oauth2/v2/auth',token:'https://oauth2.googleapis.com/token',keys:'https://www.googleapis.com/oauth2/v3/certs'},
  apple:{issuer:'https://appleid.apple.com',authorize:'https://appleid.apple.com/auth/authorize',token:'https://appleid.apple.com/auth/token',keys:'https://appleid.apple.com/auth/keys'}
}
const providerName=z.enum(['google','apple'])
type Provider=z.infer<typeof providerName>
const fresh = () => new Problem(403,'REAUTH','Для изменения способа входа выйдите из кабинета и войдите снова.')
const collision = () => new Problem(409,'EXISTS','Войдите прежним способом и подключите провайдера в настройках.')
export function social(app: FastifyInstance,ctx:AuthContext) {
  const {db,config,mac,name,csrf,issue,ownerId,rate}=ctx
  const keys={google:createRemoteJWKSet(new URL(providers.google.keys)),apple:createRemoteJWKSet(new URL(providers.apple.keys))}
  const secure=config.APP_ORIGIN.startsWith('https:')
  const credentials=(p:Provider)=> p==='google' ? [config.GOOGLE_CLIENT_ID,config.GOOGLE_CLIENT_SECRET] : [config.APPLE_CLIENT_ID,config.APPLE_CLIENT_SECRET]
  function available(p:Provider){
    const [id,secret]=credentials(p)
    if(!id || !secret) return false
    if(p==='apple'){
      try{return secure && (decodeJwt(secret).exp??0)>Date.now()/1000}catch{return false}
    }
    return true
  }
  const enabled=()=>providerName.options.filter(available)
  const callback=(p:Provider)=>config.APP_ORIGIN+'/api/auth/social/'+p+'/callback'
  const cookieOptions=(p:Provider)=>({secure,httpOnly:true,path:'/',sameSite:p==='apple'?'none' as const:'lax' as const})
  const recentSession=(tokenHash:string)=>({tokenHash,issuedAt:{gt:new Date(Date.now()-600000)},revokedAt:null,
    idleExpiresAt:{gt:new Date()},absoluteExpiresAt:{gt:new Date()}})
  app.post('/api/auth/social/start',async(req,reply)=>{
    csrf(req)
    const {provider:p,link}=z.strictObject({provider:providerName,link:z.boolean()}).parse(req.body)
    if(!available(p)) throw new Problem(503,'PROVIDER','Этот способ входа временно недоступен.')
    await rate('social:'+req.ip,30,reply)
    const sessionHash=link?digest(req.cookies[name('owner')]??''):null
    if(sessionHash){
      await ownerId(req)
      const session=await db.ownerSession.findFirst({where:recentSession(sessionHash),include:{owner:true}})
      if(!session) throw fresh()
      if(!session.owner.verifiedAt) throw new Problem(403,'VERIFY','Сначала подтвердите почту.')
    }
    const state=random(),browser=random()
    await db.authAttempt.deleteMany({where:{expiresAt:{lte:new Date()}}})
    await db.authAttempt.create({data:{stateHash:digest(state),provider:p,browserHash:digest(browser),sessionHash,expiresAt:new Date(Date.now()+600000)}})
    reply.setCookie(name('social-'+p),browser,{...cookieOptions(p),maxAge:600})
    const url=new URL(providers[p].authorize)
    url.search=new URLSearchParams({response_type:'code',client_id:credentials(p)[0]!,redirect_uri:callback(p),scope:'openid email',
      nonce:mac('nonce'+state),state,...(p==='apple'?{response_mode:'form_post'}:{
        code_challenge_method:'S256',code_challenge:createHash('sha256').update(mac('pkce'+state)).digest('base64url')})}).toString()
    return {url:url.href}
  })
  app.post('/api/owner/social/unlink',async(req)=>{
    const id=await ownerId(req),{provider}=z.strictObject({provider:providerName}).parse(req.body)
    await db.$transaction(async tx=>{
      const owner=await lockOwner(tx,id)
      if(!await tx.ownerSession.findFirst({where:recentSession(digest(req.cookies[name('owner')]??''))}))throw fresh()
      const others=await tx.providerIdentity.findMany({where:{ownerId:id,provider:{not:provider}}})
      if(!owner.hasPassword && !others.some(x=>providerName.options.some(p=>p===x.provider && available(p))))throw new Problem(409,'LAST','Сначала настройте пароль или подключите другой способ входа.')
      await tx.providerIdentity.deleteMany({where:{ownerId:id,provider}})
    })
    return {ok:true}
  })
  async function finish(p:Provider,req:FastifyRequest,reply:FastifyReply) {
    let target='/owner/login'
    try {
      if(!available(p))throw Error()
      const input=z.object({state:z.string().regex(/^[a-f0-9]{64}$/),code:z.string().min(1).max(4096).optional(),
        error:z.string().optional(),iss:z.literal(providers[p].issuer).optional()}).parse(p==='apple'?req.body:req.query)
      const where={stateHash:digest(input.state),provider:p,browserHash:digest(req.cookies[name('social-'+p)]??''),expiresAt:{gt:new Date()}}
      const attempt=await db.authAttempt.findFirst({where})
      if(!attempt || !(await db.authAttempt.deleteMany({where})).count)throw Error()
      reply.clearCookie(name('social-'+p),cookieOptions(p))
      if(attempt.sessionHash)target='/owner'
      if(input.error==='access_denied'||input.error==='user_cancelled_authorize')throw new Problem(400,'CANCEL','Вход отменён.')
      if(input.error||!input.code)throw Error()
      const [clientId,secret]=credentials(p)
      const response=await fetch(providers[p].token,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),body:new URLSearchParams({
        client_id:clientId!,client_secret:secret!,redirect_uri:callback(p),grant_type:'authorization_code',code:input.code,
        ...(p==='google' && {code_verifier:mac('pkce'+input.state)})})})
      if(!response.ok)throw Error()
      const {id_token}=z.object({id_token:z.string()}).parse(await response.json())
      const {payload}=await jwtVerify(id_token,keys[p],{issuer:providers[p].issuer,audience:clientId!,algorithms:['RS256'],
        requiredClaims:['exp','iat','sub','nonce'],maxTokenAge:'10m',clockTolerance:5})
      if(payload.nonce!==mac('nonce'+input.state)||typeof payload.sub!=='string'||!payload.sub ||
        ((Array.isArray(payload.aud)&&payload.aud.length>1 || payload.azp!==undefined) && payload.azp!==clientId))throw Error()
      const subject=payload.sub
      const owner=await db.$transaction(async tx=>{
        const existing=await tx.providerIdentity.findUnique({where:{provider_subject:{provider:p,subject}},include:{owner:true}})
        if(attempt.sessionHash){
          const session=await tx.ownerSession.findFirst({where:recentSession(attempt.sessionHash)})
          if(!session)throw fresh()
          const account=await lockOwner(tx,session.ownerId)
          if(!await tx.ownerSession.findFirst({where:recentSession(attempt.sessionHash)}))throw fresh()
          if(existing && existing.ownerId!==account.id)throw collision()
          if(!existing)await tx.providerIdentity.create({data:{provider:p,subject,ownerId:account.id}})
          return account
        }
        if(existing)return existing.owner
        const email=emailAddress.parse(payload.email)
        if(payload.email_verified!==true && payload.email_verified!=='true')throw Error()
        if(await tx.owner.findUnique({where:{normalizedEmail:email}}))throw collision()
        return tx.owner.create({data:{normalizedEmail:email,verifiedAt:new Date(),hasPassword:false,
          passwordHash:await argon2.hash(random()),identities:{create:{provider:p,subject}}}})
      })
      if(!attempt.sessionHash)await issue(owner.id,req,reply,owner.passwordHash,{provider:p,subject})
      return reply.redirect('/owner'+(attempt.sessionHash?'#account':''),303)
    } catch(e) {
      const code=e instanceof Problem ? e.code : 'PROVIDER'
      return reply.redirect(target+'?auth='+code+(target==='/owner'?'#account':''),303)
    }
  }
  app.get('/api/auth/social/google/callback',(req,reply)=>finish('google',req,reply))
  app.register(async scope=>{
    scope.addContentTypeParser('application/x-www-form-urlencoded',{parseAs:'string',bodyLimit:16384},(_req,body,done)=>{
      const params=new URLSearchParams(String(body))
      if([...params.keys()].some(k=>params.getAll(k).length!==1))return done(new Error('Некорректный ответ.'))
      done(null,Object.fromEntries(params))
    })
    scope.post('/api/auth/social/apple/callback',(req,reply)=>finish('apple',req,reply))
  })
  return enabled
}
