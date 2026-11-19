import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,randomBytes} from 'node:crypto'
import argon2 from 'argon2'
import sharp from 'sharp'
import {makeApp} from '../dist/src/app.js'
import {starter} from '../dist/src/catalog.js'
import {media} from '../dist/src/storage.js'
import pg from 'pg'
import http from 'node:http'
import {once} from 'node:events'
import {S3Client,ListObjectsV2Command,PutObjectCommand} from '@aws-sdk/client-s3'
import {calculateItemPrice} from '../../src/booking/pricing.ts'

test('transaction ordering, expiry, access audit, attempt and private storage lifecycle',async t=>{
  const e=process.env,u=new URL(e.DATABASE_URL)
  assert.equal(u.hostname,'127.0.0.1');assert.equal(u.host,e.TEST_DB_ADDR);assert.match(e.TEST_DB_NAME,/^eq_test_[a-f0-9]{12}$/);assert.equal(u.pathname,'/'+e.TEST_DB_NAME)
  assert.equal(new URL(e.S3_ENDPOINT).hostname,'127.0.0.1');assert.match(e.TEST_PROJECT,/^eq[a-f0-9]{12}$/);assert.equal(e.S3_BUCKET,e.TEST_PROJECT+'-private')
  const origin='http://127.0.0.1:3100',clock={now:()=>new Date()},secret=randomBytes(32).toString('hex')
  const {app,db}=await makeApp({APP_ORIGIN:origin,DATABASE_URL:u.href,SESSION_SECRET:secret,PORT:3100},clock)
  const dsn=new URL(e.MIGRATION_DATABASE_URL);assert.equal(dsn.host,u.host);assert.equal(dsn.pathname,u.pathname)
  const fixture=new pg.Client({connectionString:dsn.href});await fixture.connect();t.after(()=>fixture.end())
  t.after(()=>app.close())
  const address='127.18.'+randomBytes(2).join('.')
  function browser(){
    const jar={};let csrf=''
    const call=async(method,url,payload,headers={})=>{
      const r=await app.inject({method,url,remoteAddress:address,cookies:jar,headers:{host:new URL(origin).host,origin,'x-csrf-token':csrf,...headers},payload})
      for(const c of r.cookies)if(c.value)jar[c.name]=c.value;else delete jar[c.name]
      if(r.headers['content-type']?.includes('json')&&r.json().csrf)csrf=r.json().csrf
      return r
    }
    call.cookie=()=>Object.entries(jar).map(([k,v])=>`${k}=${v}`).join('; ')
    return call
  }
  const owner=browser(),anon=browser(),admin=browser(),s=randomUUID().slice(0,8),slug='test-'+s,base='/api/public/'+slug
  const creds={email:s+'@example.test',password:secret}
  await owner('GET','/api/auth/session')
  assert.equal((await owner('POST','/api/auth/register',creds)).statusCode,201)
  assert.equal((await owner('POST','/api/owner/business',{slug:'admin',name:s,phone:'+77000000003',city:s})).statusCode,400)
  const create=()=>owner('POST','/api/owner/business',{slug,name:s,phone:'+77000000003',city:s,description:'Original description'})
  const race=await Promise.all([create(),create()])
  assert.deepEqual(race.map(r=>r.statusCode).sort(),[201,409]);const b=race.find(r=>r.statusCode===201).json()
  assert.equal((await anon('GET',base)).statusCode,410)
  assert.equal((await owner('PATCH','/api/owner/profile',{published:true})).json().description,'Original description')
  const store=async()=>{const r=await anon('GET',base);assert.equal(r.statusCode,200,r.body);return r.json()}
  const a=await store(),c=starter()
  const cfg={modelId:c.models[0].id,quantity:2,upholstery:'natural',contamination:'heavy',extras:['odor'],notes:''}
  const payload=g=>({attempt:g.attempt,revision:g.revision,items:[cfg],contact:{name:'Fixture',address:'Synthetic',phone:'+77000000004',preferredDate:'2099-06-01',comment:''},uploads:[],consent:true,consentVersion:g.consentVersion})
  const headers=g=>({'x-csrf-token':g.csrf,'x-attempt':g.attempt,'x-attempt-proof':g.proof,'idempotency-key':g.attempt})
  const all=c.models.map(m=>({...cfg,modelId:m.id}))
  const parity=(await anon('POST',base+'/quote',{revision:a.revision,items:all},headers(a))).json()
  assert.deepEqual(parity.lines.map(l=>l.total),all.map(v=>calculateItemPrice(v).total))
  const submit=(g,body=payload(g))=>anon('POST',base+'/orders',body,headers(g))
  function hold(key){
    const arrived=Promise.withResolvers(),release=Promise.withResolvers()
    clock[key]=async()=>{arrived.resolve();await release.promise}
    return {ready:arrived.promise,release:()=>{delete clock[key];release.resolve()}}
  }
  const image=await sharp({create:{width:6,height:6,channels:3,background:'#668866'}}).png().toBuffer()
  const upload=(g,bytes=image)=>anon('POST',base+'/uploads',Buffer.concat([Buffer.from('--fixture\r\nContent-Disposition: form-data; name=\"image\"; filename=\"x.png\"\r\nContent-Type: image/png\r\n\r\n'),bytes,Buffer.from('\r\n--fixture--\r\n')]),{...headers(g),'content-type':'multipart/form-data; boundary=fixture'})
  assert.equal((await upload(a,Buffer.from('no image'))).statusCode,400)
  const photo=await upload(a);assert.equal(photo.statusCode,200,photo.body)
  const body={...payload(a),uploads:[photo.json().id]}
  const other=await store()
  const ownerB=browser(),anonB=browser(),slugB=slug+'-b',baseB='/api/public/'+slugB
  await ownerB('GET','/api/auth/session')
  assert.equal((await ownerB('POST','/api/auth/register',{...creds,email:'b-'+creds.email})).statusCode,201)
  const profileB={slug,name:'Tenant B',phone:'+77000000005',city:s}
  assert.equal((await ownerB('POST','/api/owner/business',profileB)).statusCode,409)
  const b2=(await ownerB('POST','/api/owner/business',{...profileB,slug:slugB})).json()
  await ownerB('PATCH','/api/owner/profile',{published:true})
  const grantB=(await anonB('GET',baseB)).json()
  assert.equal((await anonB('POST',baseB+'/orders',{...payload(grantB),uploads:body.uploads},headers(grantB))).statusCode,404)
  assert.equal(await db.customer.count({where:{businessId:b2.id}}),0)
  const s3=new S3Client({endpoint:e.S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:e.S3_ACCESS_KEY,secretAccessKey:e.S3_SECRET_KEY}})
  t.after(()=>s3.destroy())
  const keys=async()=>(await s3.send(new ListObjectsV2Command({Bucket:e.S3_BUCKET,Prefix:b.id+'/'}))).Contents?.map(v=>v.Key)??[]
  const original=await keys()
  const local=await app.listen({host:'127.0.0.1',port:0})
  const interrupted=http.request(local+base+'/uploads',{method:'POST',headers:{...headers(a),cookie:anon.cookie(),host:new URL(origin).host,origin,'content-type':'multipart/form-data; boundary=cut','content-length':500000}})
  interrupted.on('error',()=>{})
  const received=once(app.server,'request')
  interrupted.write('--cut\r\nContent-Disposition: form-data; name="image"; filename="cut.png"\r\nContent-Type: image/png\r\n\r\n')
  const [request]=await received
  const closed=once(request,'close').catch(()=>{});interrupted.destroy();await closed
  assert.deepEqual(await keys(),original);assert.equal(await db.upload.count({where:{businessId:b.id}}),1)
  assert.equal((await upload(a,Buffer.alloc(10*1024**2+65536))).statusCode,413)
  // Fault only this fixture's staged transition, after the object has actually been written.
  const fn='fail_stage_'+s;assert.match(fn,/^fail_stage_[a-f0-9]{8}$/)
  await fixture.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END $$;
    CREATE TRIGGER ${fn} BEFORE UPDATE ON "Upload" FOR EACH ROW WHEN (NEW."businessId"='${b.id}' AND NEW.state='staged') EXECUTE FUNCTION ${fn}()`)
  try{assert.equal((await upload(other)).statusCode,503);assert.deepEqual(await keys(),original)}
  finally{await fixture.query(`DROP TRIGGER ${fn} ON "Upload"; DROP FUNCTION ${fn}()`)}
  assert.equal((await submit(other,{...payload(other),uploads:body.uploads})).statusCode,404)
  assert.equal(await db.customer.count({where:{businessId:b.id}}),0)
  const h=hold('afterLock'),one=submit(a,body);await h.ready
  const retry=submit(a,body)
  c.models[0].base=30800
  const edit=(revision)=>owner('PUT','/api/owner/catalog',{revision,catalog:c})
  const update=edit(a.revision);h.release()
  const [first,duplicate,revised]=await Promise.all([one,retry,update])
  assert.equal(first.statusCode,201);assert.deepEqual(duplicate.json(),{alreadySubmitted:true,reference:first.json().reference})
  assert.equal(revised.statusCode,200)
  const committed=await db.cleaningOrder.findFirstOrThrow({where:{businessId:b.id},include:{lines:true}})
  assert.equal(committed.lines.length,1);assert.equal(committed.lines[0].snapshot.base,9000);assert.equal(committed.total,28400)
  assert.equal((await edit(a.revision)).statusCode,409)
  const next=await store(),h2=hold('beforeLock'),stale=submit(next);await h2.ready
  c.models[0].base=40000;assert.equal((await edit(next.revision)).statusCode,200);h2.release()
  assert.equal((await stale).json().error.code,'PRICE_CHANGED')
  const latest=await store(),h3=hold('beforeLock'),late=submit(latest);await h3.ready
  clock.now=()=>new Date(b.trialEndsAt);h3.release()
  assert.equal((await late).statusCode,410)
  assert.deepEqual((await submit(a,body)).json(),duplicate.json())
  assert.equal((await submit(a,{...body,uploads:[]})).statusCode,409)
  assert.equal((await anon('GET',base+'/receipts/'+first.json().reference)).statusCode,200)
  assert.equal(await db.cleaningOrder.count({where:{businessId:b.id}}),1)
  clock.now=()=>new Date()
  const orphan=await upload(latest);assert.equal(orphan.statusCode,200)
  await fixture.query('UPDATE "Upload" SET "createdAt"=$1 WHERE id=$2',[new Date(0),orphan.json().id])
  const storage=media(db);try{await storage.cleanup();await storage.cleanup()}finally{storage.close()}
  assert.equal(await db.upload.count({where:{businessId:b.id}}),1)
  const logo=()=>owner('POST','/api/owner/logo',Buffer.concat([Buffer.from('--logo\r\nContent-Disposition: form-data; name="image"; filename="brand.png"\r\nContent-Type: image/png\r\n\r\n'),image,Buffer.from('\r\n--logo--\r\n')]),{'content-type':'multipart/form-data; boundary=logo'})
  const brand=await logo();assert.equal(brand.statusCode,200,brand.body)
  const replaced=await logo();assert.notEqual(replaced.json().id,brand.json().id)
  assert.equal((await db.upload.findUniqueOrThrow({where:{id:brand.json().id}})).state,'discard')
  assert.equal((await anon('GET',base+'/logo')).headers['content-type'],'image/webp')
  const stray=`${b.id}/photo/${randomUUID()}.webp`
  await s3.send(new PutObjectCommand({Bucket:e.S3_BUCKET,Key:stray,Body:Buffer.from('fixture')}))
  const reconciler=media(db);try{
    await reconciler.reconcile();assert.ok((await keys()).includes(stray))
    await reconciler.reconcile(new Date(Date.now()+86400_000+60000));assert.ok(!(await keys()).includes(stray))
    assert.ok((await keys()).includes(original[0]))
  }finally{reconciler.close()}
  const adminEmail='operator-'+creds.email
  await fixture.query('INSERT INTO "PlatformAdmin"(id,email,"passwordHash") VALUES ($1,$2,$3)',[randomUUID(),adminEmail,await argon2.hash(secret)])
  assert.equal((await owner('GET','/api/admin/businesses')).statusCode,401)
  await admin('GET','/api/admin/session');assert.equal((await admin('POST','/api/admin/login',{email:adminEmail,password:secret})).statusCode,200)
  const access=(state,expectedVersion)=>admin('PATCH','/api/admin/businesses/'+b.id+'/access',{expectedVersion,state,endsAt:null,reason:'Disposable trial check'})
  const updates=await Promise.all([access('expired',1),access('expired',1)])
  assert.deepEqual(updates.map(r=>r.statusCode).sort(),[200,409])
  assert.equal((await owner('GET','/api/owner/preview')).statusCode,200)
  assert.equal((await owner('GET','/api/owner/photos/'+body.uploads[0])).statusCode,200)
  assert.equal((await owner('PATCH','/api/owner/profile',{city:'new'})).statusCode,403)
  assert.equal((await anon('GET',base)).statusCode,410)
  assert.equal((await access('active',2)).statusCode,200)
  assert.equal(await db.accessAudit.count({where:{businessId:b.id}}),2)
  assert.equal((await owner('PATCH','/api/owner/orders/'+committed.id+'/status',{from:'new',to:'accepted'})).statusCode,200)
  assert.equal((await owner('PATCH','/api/owner/orders/'+committed.id+'/status',{from:'new',to:'cancelled'})).statusCode,409)
  assert.equal((await owner('PATCH','/api/owner/profile',{slug:slug+'-new'})).statusCode,200)
  assert.equal((await anon('GET',base)).statusCode,410)
  assert.equal((await owner('PATCH','/api/owner/profile',{slug})).statusCode,409)
  assert.equal((await ownerB('PATCH','/api/owner/profile',{slug})).statusCode,409)
  const newer=browser();await newer('GET','/api/auth/session');assert.equal((await newer('POST','/api/auth/login',creds)).statusCode,200)
  assert.equal((await owner('PATCH','/api/owner/account',{currentPassword:secret,password:secret+'1'})).statusCode,200)
  assert.equal((await newer('GET','/api/auth/session')).json().owner,null)
  assert.equal((await newer('POST','/api/auth/login',creds)).statusCode,401)
})
