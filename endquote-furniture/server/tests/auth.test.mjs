import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { makeApp, digest } from '../dist/src/app.js'

test('owner registration, persistent sessions, CSRF, expiry, logout and rate cap', async t => {
  const url = new URL(process.env.DATABASE_URL)
  assert.match(process.env.TEST_DB_NAME, /^eq_test_[0-9a-f]{12}$/)
  assert.equal(url.pathname, '/'+process.env.TEST_DB_NAME)
  assert.equal(url.host, process.env.TEST_DB_ADDR)
  assert.equal(url.hostname,'127.0.0.1')
  const origin = 'http://127.0.0.1:3000'
  const config = {DATABASE_URL:url.href,SESSION_SECRET:randomBytes(32).toString('hex'),APP_ORIGIN:origin,PORT:3000}
  let {app,db} = await makeApp(config)
  t.after(()=>app.close())
  const jar = {}
  const remoteAddress='127.19.'+randomBytes(2).join('.')
  let csrf
  async function call(method,path,payload,headers={}) {
    const r = await app.inject({method,url:'/api/auth/'+path,remoteAddress,headers:{host:'127.0.0.1:3000',origin,...csrf && {'x-csrf-token':csrf},...headers},cookies:jar,payload})
    for (const c of r.cookies) { if(c.value) jar[c.name]=c.value; else delete jar[c.name] }
    if (r.body && r.json().csrf) csrf=r.json().csrf
    return r
  }
  const creds = {email:randomUUID()+'@example.test',password:randomBytes(24).toString('hex')}
  await call('GET','session')
  assert.equal((await call('POST','register',creds,{'x-csrf-token':'x'})).statusCode,403)
  assert.equal((await call('POST','register',creds,{origin:'https://example.test'})).statusCode,403)
  assert.equal((await call('POST','register',{...creds,role:'admin'})).statusCode,400)
  assert.equal((await call('POST','register',creds)).statusCode,201)
  await app.close()
  ;({app,db}=await makeApp(config))
  assert.equal((await call('GET','session')).json().owner.normalizedEmail,creds.email)
  assert.equal((await call('POST','register',{...creds,email:creds.email.toUpperCase()})).statusCode,409)
  await db.ownerSession.update({where:{tokenHash:digest(jar['eq-owner'])},data:{idleExpiresAt:new Date(0)}})
  assert.equal((await call('GET','session')).json().owner,null)
  assert.equal((await call('POST','login',creds)).statusCode,200)
  const saved = jar['eq-owner']
  assert.equal((await call('POST','logout',{})).statusCode,204)
  jar['eq-owner']=saved
  assert.equal((await call('GET','session')).json().owner,null)
  for(let i=0;i<5;i++) assert.equal((await call('POST','login',{...creds,password:'incorrect password'})).statusCode,401)
  assert.equal((await call('POST','login',creds)).statusCode,429)
})
