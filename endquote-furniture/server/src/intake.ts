import {z} from 'zod'
import {randomUUID} from 'node:crypto'
import type {FastifyInstance,FastifyReply,FastifyRequest} from 'fastify'
import type {Business,PrismaClient} from './generated/client.js'
import {digest,Problem,random} from './app.js'
import {catalogSchema} from './catalog.js'
import {entitled,locked,missing,unavailable,owned} from './business.js'
import {media} from './storage.js'
import {editable} from './workspace.js'
const consent='request-v1'
const item=z.strictObject({modelId:z.string().max(64),quantity:z.int().min(1).max(20),upholstery:z.enum(['standard','natural','delicate']),contamination:z.enum(['light','normal','heavy']),extras:z.array(z.enum(['odor','protection','pet-hair'])).max(3).refine(v=>new Set(v).size===v.length),notes:z.string().trim().max(500)})
const quote=z.strictObject({revision:z.int().positive(),items:z.array(item).min(1).max(20)})
const order=quote.extend({attempt:z.uuid(),contact:z.strictObject({name:z.string().trim().min(1).max(100),phone:z.string().regex(/^\+?[0-9 ()-]{8,24}$/).transform(s=>'+'+s.replace(/\D/g,'')).pipe(z.string().regex(/^\+[0-9]{8,15}$/)),address:z.string().trim().min(1).max(300),preferredDate:z.iso.date(),comment:z.string().trim().max(1000)}),consent:z.literal(true),consentVersion:z.string().max(32),uploads:z.array(z.uuid()).max(3).refine(v=>new Set(v).size===v.length)})
function storefront(b:Business){
  const c=catalogSchema.parse(b.catalog)
  const categories=c.categories.filter(v=>v.enabled),models=c.models.filter(m=>m.enabled&&categories.some(v=>v.id===m.category))
  return {profile:{name:b.name,city:b.city,area:b.area,slug:b.slug,phone:b.phone,description:b.description,social:b.social,logo:b.logoId?`/api/public/${b.slug}/logo`:null},catalog:{...c,categories,models},revision:b.catalogRevision,consentVersion:consent}
}
function price(b:Business,d:z.infer<typeof quote>){
  const {catalog:c}=storefront(b)
  if(d.revision!==b.catalogRevision){
    const unavailableItems=d.items.filter(v=>!c.models.some(m=>m.id===v.modelId)).map(v=>v.modelId)
    throw new Problem(409,'PRICE_CHANGED','Цены изменились. Проверьте новый расчёт.',unavailableItems.length?
      {revision:b.catalogRevision,unavailableItems}:{quote:price(b,{...d,revision:b.catalogRevision})})
  }
  const lines=d.items.map(v=>{
    const m=c.models.find(m=>m.id===v.modelId)
    if(!m)throw new Problem(409,'PRICE_CHANGED','Услуга недоступна. Проверьте корзину.')
    const materialBP=c.upholstery[v.upholstery],soilBP=c.contamination[v.contamination]
    const surcharge=(bp:number)=>Math.round(m.base*(bp/10000)/100)*100
    const material=surcharge(materialBP),soil=surcharge(soilBP),extras=v.extras.map(k=>({id:k,amount:c.extras[k]}))
    const unit=m.base+material+soil+extras.reduce((a,e)=>a+e.amount,0)
    return {configuration:v,name:m.name,category:c.categories.find(k=>k.id===m.category)!.name,base:m.base,materialBP,material,soilBP,soil,extras,quantity:v.quantity,unit,total:unit*v.quantity,currency:'KZT'}
  })
  const total=lines.reduce((a,l)=>a+l.total,0)
  if(total>2_147_483_647)throw new Problem(400,'TOTAL','Слишком большой заказ.')
  return {lines,total,revision:b.catalogRevision}
}
export type CommitClock={now:()=>Date;beforeLock?:()=>Promise<void>;afterLock?:()=>Promise<void>}
export function intake(app:FastifyInstance,db:PrismaClient,mac:(s:string)=>string,options:import('@fastify/cookie').CookieSerializeOptions,ownerId:(req:FastifyRequest)=>Promise<string>,rate:(k:string,n:number,r:FastifyReply)=>Promise<void>,clock:CommitClock,onNewOrder:()=>void=()=>{}){
  const files=media(db),prefix='/api/public/:slug'
  const timer=setInterval(()=>{void files.cleanup().catch(()=>{console.error('Staged media cleanup failed; retry scheduled.')})},3600_000);timer.unref()
  app.addHook('onClose',async()=>{clearInterval(timer);files.close()})
  async function resolve(req:FastifyRequest,allowClosed=false){
    const {slug}=z.object({slug:z.string()}).parse(req.params)
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)||req.raw.url?.split('?')[0].includes('%'))throw missing()
    const row=await db.slug.findUnique({where:{name:slug},include:{business:true}})
    if(!row)throw missing()
    if(row.business.slug!==slug||!allowClosed&&(!row.business.published||!entitled(row.business,clock.now())))throw unavailable()
    return row.business
  }
  const key=(b:Business)=>(options.secure?'__Host-':'')+'eq-intake-'+b.id
  function grant(req:FastifyRequest,b:Business){
    const raw=req.cookies[key(b)]??''
    const [token,end,sig]=raw.split('.')
    return /^[0-9a-f]{64}$/.test(token)&&Number(end)>Date.now()&&sig===mac(b.id+token+end)?token:null
  }
  function check(req:FastifyRequest,b:Business,read=false){
    const token=grant(req,b)
    if(!token)throw missing()
    if(!read&&req.headers['x-csrf-token']!==mac('checkout'+b.id+token))throw new Problem(403,'CSRF','Обновите страницу.')
    return digest(token)
  }
  const validAttempt=(req:FastifyRequest,b:Business,session:string,attempt:string)=>{
    if(req.headers['x-attempt-proof']!==mac(b.id+session+attempt))throw missing()
  }
  app.get(prefix,async(req,reply)=>{
    const b=await resolve(req),token=grant(req,b)??random(),end=String(Date.now()+3600_000),attempt=randomUUID()
    reply.setCookie(key(b),[token,end,mac(b.id+token+end)].join('.'),{...options,maxAge:3600})
    return {...storefront(b),csrf:mac('checkout'+b.id+token),attempt,proof:mac(b.id+digest(token)+attempt)}
  })
  app.get('/api/owner/preview',async req=>{
    const b=await owned(db,await ownerId(req)),view=storefront(b)
    if(b.logoId)view.profile.logo='/api/owner/logo'
    return view
  })
  app.post(prefix+'/quote',async req=>{const b=await resolve(req);check(req,b);return price(b,quote.parse(req.body))})
  app.post(prefix+'/orders',async(req,reply)=>{
    const initial=await resolve(req,true),session=check(req,initial),d=order.parse(req.body)
    await rate('orders:'+initial.id+':'+req.ip,60,reply)
    validAttempt(req,initial,session,d.attempt)
    if(req.headers['idempotency-key']!==d.attempt)throw new Problem(400,'KEY','Неверный ключ заявки.')
    const payloadHash=digest(JSON.stringify(d))
    await clock.beforeLock?.()
    const result = await db.$transaction(async tx=>{
      const b=await locked(tx,initial.id)
      await clock.afterLock?.()
      if(check(req,b)!==session)throw missing()
      if(initial.slug!==b.slug)throw unavailable()
      const prior=await tx.cleaningOrder.findUnique({where:{businessId_session_attempt:{businessId:b.id,session,attempt:d.attempt}}})
      if(prior){if(prior.payloadHash!==payloadHash)throw new Problem(409,'KEY_REUSED','Попытка уже использована.');return {alreadySubmitted:true,reference:prior.receipt}}
      const now=clock.now()
      if(!entitled(b,now)||!b.published)throw unavailable()
      if(d.consentVersion!==consent)throw new Problem(409,'CONSENT_CHANGED','Обновите согласие.')
      const calc=price(b,d)
      // Kazakhstan has a single UTC+5 service date. Store the requested date without timezone conversion.
      if(d.contact.preferredDate<new Date(+now+5*3600_000).toISOString().slice(0,10))throw new Problem(400,'DATE','Проверьте дату.')
      const customer=await tx.customer.upsert({where:{businessId_phone:{businessId:b.id,phone:d.contact.phone}},create:{businessId:b.id,phone:d.contact.phone,name:d.contact.name},update:{name:d.contact.name}})
      const row=await tx.cleaningOrder.create({data:{businessId:b.id,customerId:customer.id,session,attempt:d.attempt,receipt:random(),payloadHash,total:calc.total,businessName:b.name,revision:calc.revision,contact:d.contact,consentVersion:consent,consentAt:now}})
      await tx.orderLine.createMany({data:calc.lines.map((snapshot,position)=>({businessId:b.id,orderId:row.id,snapshot,position}))})
      const recipient=await tx.owner.findUnique({where:{id:b.ownerId},select:{normalizedEmail:true,verifiedAt:true}})
      if (recipient?.verifiedAt) await tx.orderNotification.create({
        data:{orderId:row.id,recipientEmail:recipient.normalizedEmail,businessName:b.name,total:calc.total}
      })
      const attached=await tx.upload.updateMany({where:{businessId:b.id,id:{in:d.uploads},session,attempt:d.attempt,purpose:'photo',state:'staged',createdAt:{gt:new Date(+now-86400_000)}},data:{orderId:row.id,state:'attached'}})
      if(attached.count!==d.uploads.length)throw missing()
      reply.code(201);return {reference:row.receipt,total:row.total}
    })
    if (!('alreadySubmitted' in result)) onNewOrder()
    return result
  })
  app.get(prefix+'/receipts/:ref',async req=>{
    const b=await resolve(req,true),session=check(req,b,true),{ref}=z.object({ref:z.string().length(64)}).parse(req.params)
    const row=await db.cleaningOrder.findFirst({where:{businessId:b.id,receipt:ref,session},select:{receipt:true,total:true,createdAt:true}})
    if(!row)throw missing();return row
  })
  app.post(prefix+'/uploads',async(req,reply)=>{
    const b=await resolve(req),session=check(req,b),attempt=z.uuid().parse(req.headers['x-attempt'])
    validAttempt(req,b,session,attempt);await rate('photo:'+req.ip,30,reply)
    return files.upload(req,b.id,'photo',session,attempt,b.slug)
  })
  app.post(prefix+'/uploads/release',async req=>{
    const b=await resolve(req),session=check(req,b),d=z.strictObject({attempt:z.uuid(),id:z.uuid()}).parse(req.body)
    validAttempt(req,b,session,d.attempt)
    const result=await db.upload.updateMany({where:{id:d.id,businessId:b.id,purpose:'photo',session,attempt:d.attempt,state:'staged'},data:{state:'discard'}})
    if(!result.count)throw missing()
    return {released:true}
  })
  app.post('/api/owner/logo',async(req,reply)=>{const b=await owned(db,await ownerId(req));editable(b);await rate('logo:'+b.id,10,reply);return files.upload(req,b.id,'logo',b.ownerId,'')})
  app.get('/api/owner/logo',async(req,reply)=>{
    const b=await owned(db,await ownerId(req))
    const row=b.logoId&&await db.upload.findFirst({where:{id:b.logoId,businessId:b.id,purpose:'logo',state:'attached'}})
    if(!row)throw missing();return reply.type('image/webp').send(await files.get(row.key))
  })
  app.get('/api/owner/photos/:id',async(req,reply)=>{
    const b=await owned(db,await ownerId(req)),{id}=z.object({id:z.uuid()}).parse(req.params)
    const row=await db.upload.findFirst({where:{id,businessId:b.id,purpose:'photo',state:'attached',orderId:{not:null}}})
    if(!row)throw missing()
    return reply.type('image/webp').send(await files.get(row.key))
  })
  app.get(prefix+'/logo',async(req,reply)=>{
    const b=await resolve(req)
    const row=b.logoId&&await db.upload.findFirst({where:{id:b.logoId,businessId:b.id,purpose:'logo',state:'attached'}})
    if(!row)throw missing();return reply.type('image/webp').send(await files.get(row.key))
  })
  return files
}
