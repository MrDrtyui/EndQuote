import type {FastifyInstance,FastifyRequest,FastifyReply} from 'fastify'
import type {Business,PrismaClient,Prisma} from './generated/client.js'
import {z} from 'zod'
import {Problem} from './app.js'
import {owned,profile,ownerView,entitled,locked,missing} from './business.js'
import {catalogSchema} from './catalog.js'

export const editable=(b:Business)=>{if(!entitled(b)) throw new Problem(403,'SUBSCRIPTION_EXPIRED','Срок доступа истёк.')}
export const conflict=()=>new Problem(409,'CONFLICT','Данные изменились. Обновите страницу.')
const status=z.enum(['new','accepted','cancelled','completed'])
const fields={id:true,createdAt:true,status:true,total:true,contact:true}
export function workspace(app:FastifyInstance,db:PrismaClient,ownerId:(req:FastifyRequest)=>Promise<string>) {
  const tenant=async(req:FastifyRequest)=>owned(db,await ownerId(req))
  async function change<T>(req:FastifyRequest,fn:(tx:Prisma.TransactionClient,b:Business)=>Promise<T>){
    const id=(await tenant(req)).id
    return db.$transaction(async tx=>{const b=await locked(tx,id);editable(b);return fn(tx,b)})
  }
  app.get('/api/owner/catalog',async req=>{const b=await tenant(req);return {revision:b.catalogRevision,catalog:b.catalog}})
  app.put('/api/owner/catalog',async req=>change(req,async(tx,b)=>{
    const d=z.strictObject({revision:z.int(),catalog:catalogSchema}).parse(req.body)
    if(b.catalogRevision!==d.revision) throw conflict()
    const next=await tx.business.update({where:{id:b.id},data:{catalog:d.catalog,catalogRevision:{increment:1}}})
    return {revision:next.catalogRevision,catalog:next.catalog}
  }))
  app.patch('/api/owner/profile',async req=>change(req,async(tx,b)=>{
    const socialLink=(host:string)=>z.url().refine(s=>{const u=new URL(s);return u.protocol==='https:'&&[host,'www.'+host].includes(u.hostname)&&!u.username&&!u.password&&!u.port})
    const d=profile.partial().extend({published:z.boolean().optional(),social:z.strictObject({instagram:socialLink('instagram.com').optional(),tiktok:socialLink('tiktok.com').optional()}).optional()}).parse(req.body)
    if(d.slug && d.slug!==b.slug) await tx.slug.create({data:{businessId:b.id,name:d.slug}})
    return ownerView(await tx.business.update({where:{id:b.id},data:{...d,catalogRevision:{increment:1}}}))
  }))
  app.get('/api/owner/summary',async req=>{
    const b=await tenant(req),since=new Date(Date.now()-30*86400_000)
    const rows=await db.cleaningOrder.groupBy({by:['status'],where:{businessId:b.id,createdAt:{gte:since}},_count:true,_sum:{total:true}})
    return {since,counts:Object.fromEntries(status.options.map(s=>[s,rows.find(r=>r.status===s)?._count??0])),estimate:rows.reduce((s,r)=>s+(r._sum.total??0),0)}
  })
  app.get('/api/owner/orders',async req=>{
    const b=await tenant(req)
    const q=z.strictObject({status:status.optional(),cursor:z.uuid().optional()}).parse(req.query)
    const cursor=q.cursor?await db.cleaningOrder.findUnique({where:{businessId_id:{businessId:b.id,id:q.cursor}},select:{createdAt:true,id:true}}):null
    if(q.cursor&&!cursor) throw missing()
    const rows=await db.cleaningOrder.findMany({where:{businessId:b.id,status:q.status,...cursor&&{OR:[{createdAt:{lt:cursor.createdAt}},{createdAt:cursor.createdAt,id:{lt:cursor.id}}]}},orderBy:[{createdAt:'desc'},{id:'desc'}],take:26,select:fields})
    return {orders:rows.slice(0,25),cursor:rows.length>25?rows[24].id:null}
  })
  app.get('/api/owner/orders/:id',async req=>{
    const {id}=z.object({id:z.uuid()}).parse(req.params),b=await tenant(req)
    const row=await db.cleaningOrder.findUnique({where:{businessId_id:{businessId:b.id,id}},select:{...fields,businessName:true,consentAt:true,consentVersion:true,revision:true,lines:{orderBy:{position:'asc'},select:{snapshot:true}},events:{orderBy:{createdAt:'asc'},select:{from:true,to:true,createdAt:true}},photos:{select:{id:true}}}})
    if(!row) throw missing()
    return row
  })
  app.patch('/api/owner/orders/:id/status',async req=>change(req,async(tx,b)=>{
    const {id}=z.object({id:z.uuid()}).parse(req.params),{from,to}=z.strictObject({from:status,to:status}).parse(req.body)
    const where={businessId:b.id,id}
    if(!await tx.cleaningOrder.count({where})) throw missing()
    if(!(from==='new'&&['accepted','cancelled'].includes(to)||from==='accepted'&&['completed','cancelled'].includes(to))||
      !(await tx.cleaningOrder.updateMany({where:{...where,status:from},data:{status:to}})).count) throw conflict()
    await tx.statusEvent.create({data:{businessId:b.id,orderId:id,actor:b.ownerId,from,to}})
    return {status:to}
  }))
}
