import serve from '@fastify/static'
import {fileURLToPath} from 'node:url'
import type {FastifyInstance} from 'fastify'
import type {PrismaClient} from './generated/client.js'
import {entitled} from './business.js'

export async function site(app:FastifyInstance,db:PrismaClient){
  const root=fileURLToPath(new URL('../../../dist/',import.meta.url))
  await app.register(serve,{root,wildcard:false,index:false,redirect:false})
  app.get('/healthz',async()=>({ok:true}))
  for(const path of ['/','/lab','/clean/chistodom','/chistodom','/owner','/owner/login','/owner/register','/owner/forgot','/owner/reset','/owner/verify','/owner/onboard','/owner/preview','/admin']){
    app.get(path,async(_req,reply)=>reply.sendFile('index.html'))
  }
  app.setNotFoundHandler(async(req,reply)=>{
    const path=req.url.split('?')[0]
    if(path==='/api'||path.startsWith('/api/'))return reply.code(404).send({error:{code:'NOT_FOUND',message:'Страница не найдена'}})
    if(req.method!=='GET'||!(req.headers.accept??'').includes('text/html')||path.includes('.')||/^\/(assets|models|marketing|previews)\//.test(path))return reply.code(404).type('text/plain').send('Страница не найдена')
    let status=404
    if(/^\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(path)){
      try{
        const b=await db.slug.findUnique({where:{name:path.slice(1)},include:{business:true}})
        if(b)status=b.business.slug===b.name&&b.business.published&&entitled(b.business)?200:410
      }catch{status=503}
    }
    return reply.code(status).sendFile('index.html')
  })
}
