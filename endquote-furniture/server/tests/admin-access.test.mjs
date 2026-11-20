import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import argon2 from 'argon2'
import {PrismaPg} from '@prisma/adapter-pg'
import {PrismaClient} from '../dist/src/generated/client.js'
import {makeApp} from '../dist/src/app.js'
import {totpAt} from '../dist/src/admin-security.js'
import {starter} from '../dist/src/catalog.js'

test('admin MFA, tenant-scoped subscription changes, audit and reauthentication',async t=>{
  const url=new URL(process.env.DATABASE_URL)
  assert.match(process.env.TEST_DB_NAME,/^eq_test_[0-9a-f]{12}$/)
  assert.equal(url.pathname,'/'+process.env.TEST_DB_NAME)
  assert.equal(url.host,process.env.TEST_DB_ADDR)
  assert.equal(url.hostname,'127.0.0.1')
  const migrationUrl=new URL(process.env.MIGRATION_DATABASE_URL)
  assert.equal(migrationUrl.pathname,url.pathname)
  assert.equal(migrationUrl.host,url.host)
  const config={
    APP_ORIGIN:'http://127.0.0.1:3000',DATABASE_URL:url.href,PORT:3000,
    SESSION_SECRET:randomBytes(32).toString('hex'),
    ADMIN_TOTP_KEY:randomBytes(32).toString('hex')
  }
  const {app,db}=await makeApp(config)
  const migrationDb=new PrismaClient({adapter:new PrismaPg({connectionString:migrationUrl.href})})
  t.after(async()=>{await app.close();await migrationDb.$disconnect()})
  const adminEmail='admin-'+randomUUID()+'@example.test',password=randomBytes(24).toString('hex')
  await migrationDb.platformAdmin.create({data:{email:adminEmail,passwordHash:await argon2.hash(password)}})
  const businessIds=[]
  for(let i=0;i<2;i++){
    const owner=await db.owner.create({data:{
      normalizedEmail:'owner-'+randomUUID()+'@example.test',
      passwordHash:await argon2.hash(randomBytes(20).toString('hex'))
    }})
    const business=await db.business.create({data:{
      name:'Тестовая химчистка '+i,slug:'test-'+randomUUID().slice(0,12),
      ownerId:owner.id,city:'Павлодар',phone:'+77001234567',
      catalog:starter(),trialEndsAt:new Date(Date.now()+14*86400_000)
    }})
    businessIds.push(business.id)
  }
  const jar={}
  let csrf=''
  const call=async(method,path,payload,headers={})=>{
    const res=await app.inject({
      method,url:'/api/'+path,
      remoteAddress:'127.23.'+randomBytes(2).join('.'),
      headers:{
        host:'127.0.0.1:3000',origin:config.APP_ORIGIN,
        ...(csrf&&{'x-csrf-token':csrf}),...headers
      },cookies:jar,payload
    })
    for(const c of res.cookies){if(c.value)jar[c.name]=c.value;else delete jar[c.name]}
    if(res.headers['content-type']?.includes('application/json')&&res.body){
      const response=res.json()
      if(response.csrf)csrf=response.csrf
    }
    return res
  }
  assert.equal((await call('GET','admin/businesses')).statusCode,401)
  assert.equal((await call('GET','admin/session')).json().stage,'login')
  const logged=await call('POST','admin/login',{email:adminEmail,password})
  assert.equal(logged.statusCode,200,logged.body)
  assert.equal((await call('GET','admin/businesses')).statusCode,403)
  assert.equal((await call('GET','admin/session')).json().stage,'setup')
  const setup=await call('POST','admin/mfa/setup',{})
  assert.equal(setup.statusCode,200,setup.body)
  const secret=setup.json().secret
  assert.match(secret,/^[A-Z2-7]{32}$/)
  const activate=await call('POST','admin/mfa/activate',{code:totpAt(secret,Math.floor(Date.now()/30000))})
  assert.equal(activate.statusCode,200,activate.body)
  assert.equal((await call('GET','admin/session')).json().stage,'ready')
  const overview=await call('GET','admin/overview')
  assert.equal(overview.statusCode,200,overview.body)
  assert.ok(overview.json().total>=2)
  const first=await db.business.findUniqueOrThrow({where:{id:businessIds[0]}})
  const nextMonth=new Date(Date.now()+30*86400_000).toISOString()
  const changed=await call('PATCH','admin/businesses/'+first.id+'/access',{
    expectedVersion:first.accessVersion,state:'active',endsAt:nextMonth,reason:'Тестовая активация подписки'
  })
  assert.equal(changed.statusCode,200,changed.body)
  const unchanged=await db.business.findUniqueOrThrow({where:{id:businessIds[1]}})
  assert.equal(unchanged.accessState,'trial')
  const audits=await db.accessAudit.findMany({where:{businessId:first.id}})
  assert.equal(audits.length,1)
  assert.equal(audits[0].reason,'Тестовая активация подписки')
  const otherAudits=await db.accessAudit.count({where:{businessId:businessIds[1]}})
  assert.equal(otherAudits,0)
  await db.adminSession.updateMany({data:{reauthAt:new Date(0)}})
  const stale=await call('PATCH','admin/businesses/'+first.id+'/access',{
    expectedVersion:first.accessVersion+1,state:'suspended',endsAt:null,reason:'Тестовая приостановка доступа'
  })
  assert.equal(stale.statusCode,403)
  assert.equal(stale.json().error.code,'REAUTH')
  const bad=await call('POST','admin/reauth',{password:'wrong password',code:'000000'})
  assert.equal(bad.statusCode,401)
  const reauth=await call('POST','admin/reauth',{
    password,code:totpAt(secret,Math.floor(Date.now()/30000)+1)
  })
  assert.equal(reauth.statusCode,200,reauth.body)
  const suspended=await call('PATCH','admin/businesses/'+first.id+'/access',{
    expectedVersion:first.accessVersion+1,state:'suspended',endsAt:null,reason:'Тестовая приостановка доступа'
  })
  assert.equal(suspended.statusCode,200,suspended.body)
  assert.equal(await db.accessAudit.count({where:{businessId:first.id}}),2)
  assert.equal((await db.business.findUniqueOrThrow({where:{id:first.id}})).accessState,'suspended')
  assert.equal((await call('GET','admin/activity')).statusCode,200)
  assert.equal((await call('GET','admin/businesses/'+first.id)).statusCode,200)
  assert.equal((await call('POST','admin/logout',{})).statusCode,204)
  assert.equal((await call('GET','admin/businesses')).statusCode,401)
})
