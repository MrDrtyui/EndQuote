import { z } from 'zod'
const defaults = [
  ['sofa-2-seater','Двухместный диван','sofa',9000],['sofa-3-seater','Трёхместный диван','sofa',12000],
  ['sofa-4-seater','Четырёхместный диван','sofa',15000],['sofa-l-shaped','Угловой диван','sofa',17000],
  ['sofa-u-shaped','П-образный диван','sofa',22000],['sofa-bed','Диван-кровать','sofa',16000],
  ['armchair','Кресло','armchair',5000],['dining-chair','Мягкий обеденный стул','chair',2000],['ottoman','Пуф','ottoman',3000],
  ['mattress-single','Односпальный матрас','mattress',7000],['mattress-double','Двуспальный матрас','mattress',10000],
  ['upholstered-headboard','Мягкое изголовье','headboard',6000],
] as const
const label = z.string().trim().min(1).max(100)
const amount = z.int().min(0).max(1000000)
const bp = z.int().min(0).max(30000)
export const catalogSchema = z.strictObject({
  categories:z.array(z.strictObject({id:z.string().regex(/^[a-z][a-z0-9-]{0,30}$/),name:label,enabled:z.boolean()})).min(1).max(40),
  models:z.array(z.strictObject({id:z.enum(defaults.map(d=>d[0])),name:label,category:label,enabled:z.boolean(),base:amount})).length(defaults.length),
  upholstery:z.strictObject({standard:bp,natural:bp,delicate:bp}),
  contamination:z.strictObject({light:bp,normal:bp,heavy:bp}),
  extras:z.strictObject({odor:amount,protection:amount,'pet-hair':amount}),
}).refine(c => new Set(c.models.map(m=>m.id)).size === defaults.length &&
  new Set(c.categories.map(v=>v.id)).size === c.categories.length &&
  c.models.every(m=>c.categories.some(v=>v.id===m.category)), 'Invalid catalog mapping')
export function starter() {
  return catalogSchema.parse({
    categories:Object.entries({sofa:'Диваны',armchair:'Кресла',chair:'Стулья',ottoman:'Пуфы',mattress:'Матрасы',headboard:'Изголовья'}).map(([id,name])=>({id,name,enabled:true})),
    models:defaults.map(([id,name,category,base])=>({id,name,category,base,enabled:true})),
    upholstery:{standard:0,natural:1500,delicate:2500},contamination:{light:0,normal:0,heavy:2000},extras:{odor:2000,protection:2500,'pet-hair':1500},
  })
}
