import test from 'node:test'
import assert from 'node:assert/strict'
import {randomBytes,randomUUID} from 'node:crypto'
import {makeApp} from '../dist/src/app.js'

test('closed storefront reasons are available only to the current owner',async t=>{
  const dsn=new URL(process.env.DATABASE_URL)
  assert.equal(dsn.hostname,'127.0.0.1')
  assert.match(process.env.TEST_DB_NAME,/^eq_test_[0-9a-f]{12}$/)
  assert.equal(dsn.pathname,'/'+process.env.TEST_DB_NAME)
  assert.equal(dsn.host,process.env.TEST_DB_ADDR)
  const host='127.0.0.1:3000', origin='http://'+host
  const {app,db}=await makeApp({DATABASE_URL:dsn.href,SESSION_SECRET:randomBytes(32).toString('hex'),APP_ORIGIN:origin,PORT:3000})
  t.after(()=>app.close())
  const get=(url,cookies={})=>app.inject({url,cookies,headers:{host}})
  async function register(){
    const session=await get('/api/auth/session')
    const reply=await app.inject({method:'POST',url:'/api/auth/register',headers:{host,origin,'x-csrf-token':session.json().csrf},
      cookies:Object.fromEntries(session.cookies.map(c=>[c.name,c.value])),
      payload:{email:randomUUID()+'@example.test',password:randomBytes(20).toString('hex')}})
    assert.equal(reply.statusCode,201)
    return {id:reply.json().owner.id,cookies:Object.fromEntries(reply.cookies.map(c=>[c.name,c.value]))}
  }
  const owner=await register(),other=await register(),slug='state-'+randomUUID().slice(0,8)
  const endedAt=new Date('2020-01-02T10:00:00Z'),name='Закрытый тестовый бизнес'
  const business=await db.business.create({data:{ownerId:owner.id,name,slug,city:'Павлодар',phone:'+77000000000',
    catalog:(await import('../dist/src/catalog.js')).starter(),published:true,trialEndsAt:endedAt,slugs:{create:{name:slug}}}})
  const publicUrl='/api/public/'+slug,privateUrl='/api/owner/storefront-status/'+slug
  const generic={error:{code:'UNAVAILABLE',message:'Витрина сейчас недоступна'}}
  for(const cookies of [{},owner.cookies,other.cookies]){
    const response=await get(publicUrl,cookies)
    assert.equal(response.statusCode,410);assert.deepEqual(response.json(),generic)
  }
  assert.equal((await get(privateUrl)).statusCode,401)
  const stranger=await get(privateUrl+'?owner=true',other.cookies)
  assert.equal(stranger.statusCode,404)
  assert.deepEqual(stranger.json(),(await get(privateUrl+'-missing',other.cookies)).json())
  const closed=await get(privateUrl,owner.cookies)
  assert.equal(closed.headers['cache-control'],'no-store')
  assert.deepEqual(closed.json(),{kind:'expired',trial:true,name,endedAt:endedAt.toISOString()})
  await db.business.update({where:{id:business.id},data:{published:false,accessState:'active',paidThrough:endedAt}})
  assert.deepEqual((await get(privateUrl,owner.cookies)).json(),{kind:'expired',trial:false,name,endedAt:endedAt.toISOString()})
  await db.business.update({where:{id:business.id},data:{paidThrough:null}})
  assert.deepEqual((await get(publicUrl)).json(),generic)
  assert.deepEqual((await get(privateUrl,owner.cookies)).json(),{kind:'unpublished',name})
  await db.business.update({where:{id:business.id},data:{published:true}})
  assert.deepEqual((await get(privateUrl,owner.cookies)).json(),{kind:'open'})
  const open=await get(publicUrl)
  assert.equal(open.statusCode,200);assert.equal(open.json().profile.slug,slug)
  assert.equal((await get(publicUrl+'-missing')).statusCode,404)
})
