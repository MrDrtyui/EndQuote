import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {setTimeout as pause} from 'node:timers/promises'
import {generateKeyPair,exportJWK,SignJWT} from 'jose'
import {makeApp,digest} from '../dist/src/app.js'

test('verification, recovery, onboarding and explicit OIDC account linking',async t=>{
  const url=new URL(process.env.DATABASE_URL)
  assert.equal(url.hostname,'127.0.0.1')
  assert.match(process.env.TEST_DB_NAME,/^eq_test_[0-9a-f]{12}$/)
  assert.equal(url.pathname,'/'+process.env.TEST_DB_NAME)
  assert.equal(url.host,process.env.TEST_DB_ADDR)
  const origin='https://endquote.example.test'
  const config={APP_ORIGIN:origin,DATABASE_URL:url.href,SESSION_SECRET:randomBytes(32).toString('hex'),
    MAIL_FROM:'test@example.test',RESEND_API_KEY:'test',GOOGLE_CLIENT_ID:'google-test',GOOGLE_CLIENT_SECRET:'test',
    APPLE_CLIENT_ID:'apple-test',APPLE_CLIENT_SECRET:'e30.'+Buffer.from(JSON.stringify({exp:Date.now()/1000+3600})).toString('base64url')+'.AA'}
  const {app,db}=await makeApp(config)
  t.after(()=>app.close())
  const letters=[],codes=new Map()
  const {privateKey,publicKey}=await generateKeyPair('RS256',{extractable:true})
  const jwk={...await exportJWK(publicKey),kid:'test',alg:'RS256'}
  t.mock.method(globalThis,'fetch',async(input,init)=>{
    const u=String(input)
    if(u==='https://api.resend.com/emails'){
      const body=JSON.parse(init.body)
      letters.push({to:body.to[0],token:body.text.match(/#([a-f0-9]{64})/)[1]})
      return Response.json({id:'fixture'})
    }
    if(['https://www.googleapis.com/oauth2/v3/certs','https://appleid.apple.com/auth/keys'].includes(u))return Response.json({keys:[jwk]})
    assert.ok(['https://oauth2.googleapis.com/token','https://appleid.apple.com/auth/token'].includes(u))
    const entry=codes.get(init.body.get('code'))
    assert.ok(entry)
    if(entry.challenge)assert.equal(createHash('sha256').update(init.body.get('code_verifier')).digest('base64url'),entry.challenge)
    assert.equal(init.body.get('redirect_uri'),entry.callback)
    return Response.json({id_token:entry.idToken})
  })
  let jar={},csrf
  async function call(method,path,body,extra={}){
    const r=await app.inject({method,url:'/api/'+path,payload:body,cookies:jar,headers:{host:new URL(origin).host,origin,'x-csrf-token':csrf??'',...extra}})
    for(const c of r.cookies){if(c.value)jar[c.name]=c.value;else delete jar[c.name]}
    if(!path.startsWith('public/')&&r.headers['content-type']?.includes('json')&&r.json().csrf)csrf=r.json().csrf
    return r
  }
  const post=(path,body)=>call('POST',path,body)
  async function ok(method,path,body,status=200){
    const r=await call(method,path,body)
    assert.equal(r.statusCode,status,r.body);return r.json()
  }
  const session=()=>ok('GET','auth/session')
  const email=randomUUID()+'@example.test',password=randomBytes(18).toString('hex')
  await session()
  await ok('POST','auth/register',{email,password},201)
  const original=letters.at(-1).token
  assert.equal((await db.mailToken.findUnique({where:{hash:digest(original)}})).email,email)
  assert.equal((await post('auth/login',{email,password})).statusCode,200)
  const business={name:'Тест',slug:'test-'+randomUUID().slice(0,8),city:'Павлодар',phone:'+77000000001'}
  await ok('POST','owner/business',business,201)
  assert.equal((await call('PATCH','owner/profile',{published:true})).statusCode,403)
  await ok('POST','owner/verify',{})
  assert.equal((await post('auth/confirm',{token:original})).statusCode,400)
  const second=letters.at(-1).token
  await db.mailToken.update({where:{hash:digest(second)},data:{expiresAt:new Date(0)}})
  assert.equal((await post('auth/confirm',{token:second})).statusCode,400)
  await ok('POST','owner/verify',{})
  await ok('POST','owner/verify',{})
  assert.equal((await post('owner/verify',{})).statusCode,429)
  const token=letters.at(-1).token
  await ok('POST','auth/confirm',{token})
  assert.equal((await post('auth/confirm',{token})).statusCode,400)
  await ok('POST','auth/login',{email,password})
  await ok('PATCH','owner/profile',{published:true})
  const storefront='public/'+business.slug
  const grant=await ok('GET',storefront)
  const headers={'x-csrf-token':grant.csrf,'x-attempt':grant.attempt,'x-attempt-proof':grant.proof,'idempotency-key':grant.attempt}
  const order=await call('POST',storefront+'/orders',{
    attempt:grant.attempt,revision:grant.revision,consent:true,consentVersion:grant.consentVersion,uploads:[],
    items:[{modelId:grant.catalog.models[0].id,quantity:1,upholstery:'standard',contamination:'normal',extras:[],notes:''}],
    contact:{name:'Тест',address:'Тестовый адрес',phone:'+77000000002',preferredDate:'2099-01-01',comment:''}
  },headers)
  assert.equal(order.statusCode,201,order.body)
  const dashboard=await ok('GET','owner/orders')
  assert.equal(dashboard.orders.length,1)
  assert.equal(dashboard.orders[0].total,order.json().total)
  const newEmail='new-'+email
  await ok('PATCH','owner/account',{email:newEmail,currentPassword:password})
  assert.equal((await session()).owner.normalizedEmail,email)
  assert.equal((await ok('GET','owner/account')).pending,newEmail)
  await ok('POST','auth/confirm',{token:letters.at(-1).token})
  assert.equal((await session()).owner,null)
  await ok('POST','auth/login',{email:newEmail,password})
  const count=letters.length
  await ok('POST','auth/recover',{email:'missing-'+email},202)
  await ok('POST','auth/recover',{email:newEmail},202)
  for(let i=0;i<100 && count===letters.length;i++)await pause(10)
  assert.equal(letters.length,count+1)
  const reset={token:letters.at(-1).token,password:password+'2'}
  await ok('POST','auth/confirm',reset)
  assert.equal((await session()).owner,null)
  assert.equal((await post('auth/confirm',reset)).statusCode,400)
  assert.equal((await post('auth/login',{email:newEmail,password})).statusCode,401)
  async function social(p,email,subject,link=false,invalidNonce=false){
    const {url}=await ok('POST','auth/social/start',{provider:p,link})
    const params=new URL(url).searchParams,code=randomUUID(),state=params.get('state')
    const issuer=p==='google'?'https://accounts.google.com':'https://appleid.apple.com'
    const idToken=await new SignJWT({nonce:invalidNonce?'wrong':params.get('nonce'),email,email_verified:true})
      .setProtectedHeader({alg:'RS256',kid:'test'}).setIssuedAt().setExpirationTime('5m').setSubject(subject).setIssuer(issuer).setAudience(p+'-test').sign(privateKey)
    codes.set(code,{idToken,challenge:params.get('code_challenge'),callback:params.get('redirect_uri')})
    const response=new URLSearchParams({state,code}).toString(),path='auth/social/'+p+'/callback'
    return p==='google'?call('GET',path+'?'+response):call('POST',path,response,{origin:issuer,'content-type':'application/x-www-form-urlencoded'})
  }
  const cancelled=new URL((await ok('POST','auth/social/start',{provider:'google',link:false})).url).searchParams.get('state')
  assert.match((await call('GET','auth/social/google/callback?state='+cancelled+'&error=access_denied')).headers.location,/auth=CANCEL/)
  assert.match((await call('GET','auth/social/google/callback?state='+cancelled+'&error=access_denied')).headers.location,/auth=PROVIDER/)
  assert.match((await social('google',newEmail,'collision')).headers.location,/auth=EXISTS/)
  assert.equal((await session()).owner,null)
  for(const p of ['google','apple']){
    const accountEmail=p+'-'+email,subject=randomUUID()
    assert.match((await social(p,accountEmail,subject,false,true)).headers.location,/auth=PROVIDER/)
    assert.equal((await social(p,accountEmail,subject)).headers.location,'/owner')
    const s=await session();assert.equal(s.onboarded,false);assert.equal(s.owner.normalizedEmail,accountEmail)
    await ok('POST','owner/business',{...business,slug:p+'-'+business.slug},201)
    assert.equal((await post('owner/social/unlink',{provider:p})).statusCode,409)
    const other=p==='google'?'apple':'google'
    assert.equal((await social(other,accountEmail,randomUUID(),true)).headers.location,'/owner#account')
    await ok('POST','owner/social/unlink',{provider:other})
    assert.deepEqual((await ok('GET','owner/account')).linked,[p])
    await post('auth/logout',{});await session()
    await social(p,accountEmail,subject)
    assert.equal((await session()).owner.id,s.owner.id)
    const recoveryCount=letters.length
    await ok('POST','auth/recover',{email:accountEmail},202)
    for(let i=0;i<100 && recoveryCount===letters.length;i++)await pause(10)
    await ok('POST','auth/confirm',{token:letters.at(-1).token,password})
    assert.equal((await session()).owner,null)
    await ok('POST','auth/login',{email:accountEmail,password})
    await ok('POST','owner/social/unlink',{provider:p})
    assert.deepEqual((await ok('GET','owner/account')).linked,[])
    await post('auth/logout',{});await session()
  }
  for(let i=0;i<2;i++)await ok('POST','auth/recover',{email:'missing-'+email},202)
  assert.equal((await post('auth/recover',{email:'missing-'+email})).statusCode,429)
})
