import { z } from 'zod'
import { type Business, type Prisma, type PrismaClient } from './generated/client.js'
import { Problem } from './app.js'
import { starter } from './catalog.js'

const reserved = new Set('api owner admin lab clean chistodom assets models marketing previews health healthz ready readyz livez metrics static public uploads favicon manifest dist src node_modules'.split(' '))
export const slug = z.string().trim().regex(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/).min(3).max(48).toLowerCase().refine(s=>!reserved.has(s))
export const profile = z.strictObject({
  slug,name:z.string().trim().min(1).max(100),city:z.string().trim().min(1).max(100),
  phone:z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  description:z.string().trim().max(1000).optional(),area:z.string().trim().max(180).optional(),
})
export const entitled = (b:Business,now=new Date()) => b.accessState==='trial' ? b.trialEndsAt>now : b.accessState==='active' && (!b.paidThrough || b.paidThrough>now)
export const missing = () => new Problem(404,'NOT_FOUND','Страница не найдена')
export const unavailable = () => new Problem(410,'UNAVAILABLE','Витрина сейчас недоступна')
export async function locked(tx:Prisma.TransactionClient,id:string) {
  await tx.$queryRaw`SELECT id FROM "Business" WHERE id=${id}::uuid FOR UPDATE`
  const b=await tx.business.findUnique({where:{id}})
  if (!b) throw missing()
  return b
}
export async function owned(db:PrismaClient,ownerId:string) {
  const b=await db.business.findUnique({where:{ownerId}})
  if(!b) throw missing()
  return b
}
export function onboard(db:PrismaClient,ownerId:string,data:z.infer<typeof profile>) {
  return db.business.create({data:{...data,ownerId,catalog:starter(),trialEndsAt:new Date(Date.now()+14*86400_000),slugs:{create:{name:data.slug}}}})
}
export function ownerView(b:Business) {
  const {catalog,ownerId,...rest}=b
  return {...rest,editable:entitled(b),url:'/'+b.slug}
}
