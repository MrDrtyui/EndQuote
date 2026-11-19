import {S3Client,PutObjectCommand,GetObjectCommand,DeleteObjectCommand,HeadBucketCommand,ListObjectsV2Command} from '@aws-sdk/client-s3'
import sharp from 'sharp'
import {randomUUID} from 'node:crypto'
import type {FastifyRequest} from 'fastify'
import type {PrismaClient,Prisma} from './generated/client.js'
import {Problem} from './app.js'
import {entitled,locked,unavailable} from './business.js'
import {editable} from './workspace.js'

export function media(db:PrismaClient) {
  const bucket=process.env.S3_BUCKET
  const client=new S3Client({endpoint:process.env.S3_ENDPOINT,region:process.env.S3_REGION??'us-east-1',forcePathStyle:true,
    credentials:{accessKeyId:process.env.S3_ACCESS_KEY??'',secretAccessKey:process.env.S3_SECRET_KEY??''}})
  const remove=(key:string)=>client.send(new DeleteObjectCommand({Bucket:bucket,Key:key}))
  async function cleanup(){
    const expired=await db.upload.findMany({where:{state:{in:['staged','pending','discard']},OR:[{state:'discard'},{createdAt:{lt:new Date(Date.now()-86400_000)}}]},take:100})
    for(const row of expired){
      // Claim before deleting so checkout cannot attach between the DB and S3 operations.
      if(!(await db.upload.updateMany({where:{id:row.id,state:row.state},data:{state:'discard'}})).count)continue
      await remove(row.key)
      await db.upload.deleteMany({where:{id:row.id,state:'discard'}})
    }
  }
  async function reconcile(now=new Date()){
    if(!bucket)throw new Error('Missing private bucket')
    let cursor:string|undefined
    do{
      const page=await client.send(new ListObjectsV2Command({Bucket:bucket,ContinuationToken:cursor,MaxKeys:500}))
      for(const object of page.Contents??[]){
        if(!object.Key||!object.LastModified||+object.LastModified>+now-86400_000||
          !/^[a-f0-9-]{36}\/(photo|logo)\/[a-f0-9-]{36}\.webp$/.test(object.Key))continue
        if(!await db.upload.count({where:{key:object.Key}}))await remove(object.Key)
      }
      cursor=page.NextContinuationToken
    }while(cursor)
  }
  async function upload(req:FastifyRequest,businessId:string,purpose:'logo'|'photo',session:string,attempt:string,slug?:string){
    if(!bucket) throw new Problem(503,'STORAGE','Хранилище недоступно.')
    const max=purpose==='logo'?2*1024**2:10*1024**2
    const cap=max+64*1024
    if(Number(req.headers['content-length']??0)>cap)throw new Problem(413,'TOO_LARGE','Слишком большой запрос.')
    let received=0
    const count=(chunk:Buffer)=>{received+=chunk.length;if(received>cap)req.raw.destroy()}
    let image:Buffer|undefined
    req.raw.on('data',count)
    try{for await(const part of req.parts({limits:{fileSize:max,files:1,parts:1,fields:0}})){
      if(part.type!=='file'||part.fieldname!=='image'||!['image/jpeg','image/png','image/webp'].includes(part.mimetype)) throw new Problem(400,'IMAGE','Нужен JPEG, PNG или WebP.')
      const bytes=await part.toBuffer()
      const fmt=bytes.subarray(0,3).equals(Buffer.from([255,216,255]))?'jpeg':bytes.subarray(0,8).equals(Buffer.from('89504e470d0a1a0a','hex'))?'png':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'?'webp':null
      if(!fmt||'image/'+fmt!==part.mimetype||part.file.truncated) throw new Problem(400,'IMAGE','Файл не соответствует формату.')
      try {
        const decoder=sharp(bytes,{limitInputPixels:16_000_000,failOn:'warning'})
        if((await decoder.metadata()).format!==fmt) throw Error()
        image=await decoder.rotate().resize({width:purpose==='logo'?512:1600,height:purpose==='logo'?512:1600,fit:'inside',withoutEnlargement:true}).webp({quality:80}).toBuffer()
      }catch{throw new Problem(400,'IMAGE','Не удалось прочитать изображение.')}
    }}finally{req.raw.off('data',count)}
    req.signal.throwIfAborted()
    if(!image||image.length>3*1024**2)throw new Problem(400,'IMAGE','Изображение слишком большое или отсутствует.')
    const id=randomUUID(),key=`${businessId}/${purpose}/${id}.webp`,size=image.length
    const guard=async(tx:Prisma.TransactionClient)=>{
      const b=await locked(tx,businessId)
      if(purpose==='logo')editable(b)
      else if(!entitled(b)||!b.published||b.slug!==slug)throw unavailable()
      return b
    }
    await db.$transaction(async tx=>{
      await guard(tx)
      if(((await tx.upload.aggregate({where:{businessId},_sum:{size:true}}))._sum.size??0)+size>512*1024**2 ||
        purpose==='photo'&&await tx.upload.count({where:{businessId,session,attempt,state:{not:'discard'}}})>=3)throw new Problem(429,'QUOTA','Лимит фотографий исчерпан.')
      await tx.upload.create({data:{id,key,size,businessId,purpose,session,attempt,state:'pending'}})
    })
    try{
      await client.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:image,ContentType:'image/webp'}),{abortSignal:req.signal})
      await db.$transaction(async tx=>{
        const b=await guard(tx)
        req.signal.throwIfAborted()
        await tx.upload.update({where:{id,state:'pending'},data:{state:purpose==='logo'?'attached':'staged'}})
        if(purpose==='logo'){
          await tx.business.update({where:{id:businessId},data:{logoId:id}})
          if(b.logoId)await tx.upload.updateMany({where:{businessId,id:b.logoId},data:{state:'discard'}})
        }
      })
    }catch(e){await db.upload.updateMany({where:{id,state:'pending'},data:{state:'discard'}});await cleanup().catch(()=>{});throw e}
    return {id}
  }
  return {upload,cleanup,reconcile,ready:()=>client.send(new HeadBucketCommand({Bucket:bucket})),close:()=>client.destroy(),get:async(key:string)=>(await client.send(new GetObjectCommand({Bucket:bucket,Key:key}))).Body}
}
