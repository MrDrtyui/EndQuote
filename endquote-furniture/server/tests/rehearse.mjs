// Rehearse only against an explicitly identified, generated local test database/bucket.
import {execFileSync} from 'node:child_process'
import {copyFileSync,cpSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {randomBytes,createHash} from 'node:crypto'
import assert from 'node:assert/strict'
import pg from 'pg'
import {S3Client,CreateBucketCommand,GetObjectCommand,PutObjectCommand} from '@aws-sdk/client-s3'
const e=process.env,url=new URL(e.MIGRATION_DATABASE_URL)
assert.match(e.TEST_DB_NAME,/^eq_test_[a-f0-9]{12}$/);assert.equal(url.pathname,'/'+e.TEST_DB_NAME)
assert.equal(url.host,e.TEST_DB_ADDR);assert.equal(url.hostname,'127.0.0.1')
assert.match(e.TEST_PROJECT,/^eq[a-f0-9]{12}$/);assert.equal(e.S3_BUCKET,e.TEST_PROJECT+'-private')
assert.equal(new URL(e.S3_ENDPOINT).hostname,'127.0.0.1')
const dir=mkdtempSync(join(e.TMPDIR??tmpdir(),'eq-rehearse-')),cli=resolve('node_modules/.bin/prisma')
const run=(cmd,args,env=e)=>execFileSync(cmd,args,{env,stdio:['ignore','pipe','inherit']}).toString()
const db=new pg.Client({connectionString:url.href});await db.connect()
async function fresh(){
  const name='eq_test_'+randomBytes(6).toString('hex');await db.query(`CREATE DATABASE "${name}"`)
  const next=new URL(url);next.pathname='/'+name;return next.href
}
const deploy=(dsn,args,config='prisma.config.ts')=>run(cli,['migrate',...args,'--config',config],{...e,MIGRATION_DATABASE_URL:dsn})
const s3=new S3Client({endpoint:e.S3_ENDPOINT,region:'us-east-1',forcePathStyle:true,credentials:{accessKeyId:e.S3_ACCESS_KEY,secretAccessKey:e.S3_SECRET_KEY}})
async function fingerprint(dsn){
  const c=new pg.Client({connectionString:dsn});await c.connect()
  try{return (await c.query(`SELECT b.id,b."catalogRevision",o.id AS "order",o.total,l.snapshot,u.key
    FROM "Business" b LEFT JOIN "CleaningOrder" o ON o."businessId"=b.id LEFT JOIN "OrderLine" l ON l."orderId"=o.id LEFT JOIN "Upload" u ON u."orderId"=o.id
    ORDER BY b.id,o.id,l.position,u.id`)).rows}finally{await c.end()}
}
try{
  const source=await fingerprint(url.href);assert.ok(new Set(source.filter(x=>x.order).map(x=>x.id)).size>=2,'Run the two-tenant checkout first')
  const empty=await fresh()
  deploy(empty,['deploy']);deploy(empty,['deploy']);deploy(empty,['status'])
  const restore=await fresh(),archive=join(dir,'test.dump')
  run('pg_dump',['--format=custom','--file',archive,url.href])
  run('pg_restore',['--exit-on-error','--no-owner','--dbname',restore,archive])
  assert.deepEqual(await fingerprint(restore),source)
  const bucket=e.TEST_PROJECT+'-restore-'+randomBytes(4).toString('hex')
  await s3.send(new CreateBucketCommand({Bucket:bucket}))
  for(const {key} of (await db.query('SELECT key FROM "Upload" WHERE state=$1',['attached'])).rows){
    const get=async(Bucket)=>Buffer.from(await (await s3.send(new GetObjectCommand({Bucket,Key:key}))).Body.transformToByteArray())
    const bytes=await get(e.S3_BUCKET);await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:'image/webp'}))
    assert.equal(createHash('sha256').update(await get(bucket)).digest('hex'),createHash('sha256').update(bytes).digest('hex'))
  }
  const upgrade=await fresh(),migrations=join(dir,'migrations')
  mkdirSync(migrations);copyFileSync('prisma/migrations/migration_lock.toml',join(migrations,'migration_lock.toml'))
  for(const s of ['202611190001_owner_auth','202611190002_business','202611190003_orders'])cpSync('prisma/migrations/'+s,join(migrations,s),{recursive:true})
  const config=join(dir,'prisma.config.mjs')
  writeFileSync(config,`export default {schema:${JSON.stringify(resolve('prisma/schema.prisma'))},migrations:{path:${JSON.stringify(migrations)}},datasource:{url:process.env.MIGRATION_DATABASE_URL}}`)
  deploy(upgrade,['deploy'],config)
  const tables=['Owner','Business','Slug','Customer','CleaningOrder','OrderLine','Upload','StatusEvent']
  run('pg_dump',['--format=custom','--data-only','--file',join(dir,'fixtures.dump'),...tables.flatMap(t=>['--table','"'+t+'"']),url.href])
  run('pg_restore',['--exit-on-error','--no-owner','--dbname',upgrade,join(dir,'fixtures.dump')])
  deploy(upgrade,['deploy']);deploy(upgrade,['status']);assert.deepEqual(await fingerprint(upgrade),source)
  console.log('PASS: fresh/repeat deploy, populated phase-3 upgrade, restore to separate DB and private bucket with snapshot and object-byte comparisons.')
}finally{await db.end();s3.destroy()}
