// Requires an already running local Docker daemon and locally available dependency images.
import {execFileSync,spawn} from 'node:child_process'
import {randomBytes} from 'node:crypto'
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {once} from 'node:events'
import {createServer} from 'node:net'
import assert from 'node:assert/strict'
import pg from 'pg'
import {S3Client,CreateBucketCommand} from '@aws-sdk/client-s3'
const run=(cmd,args,opts={})=>execFileSync(cmd,args,{stdio:['ignore','pipe','inherit'],...opts})?.toString().trim()
assert.equal(process.versions.node.split('.')[0],'24')
const ctx=run('docker',['context','show'])
assert.match(run('docker',['context','inspect',ctx,'--format','{{.Endpoints.docker.Host}}']),/^unix:\/\//)
assert.ok(!process.env.DOCKER_HOST||process.env.DOCKER_HOST.startsWith('unix:///'))
const hex=n=>randomBytes(n).toString('hex'),project='eq'+hex(6),dbname='eq_test_'+hex(6),sqlPassword=hex(24),runtimePassword=hex(24),key=hex(12),secret=hex(24)
const images=['postgres:17',process.env.EQ_TEST_MINIO_IMAGE??'minio/minio:RELEASE.2025-09-07T16-13-09Z']
images.forEach(image=>run('docker',['image','inspect',image,'--format','{{.Id}}']))
const parent=join(tmpdir(),'opencode');mkdirSync(parent,{recursive:true});const dir=mkdtempSync(join(parent,'eq-disposable-'))
const manifest=join(dir,'compose.json')
writeFileSync(manifest,JSON.stringify({services:{
  pg:{image:images[0],environment:{POSTGRES_DB:dbname,POSTGRES_PASSWORD:sqlPassword},ports:['127.0.0.1::5432'],volumes:['database:/var/lib/postgresql/data'],healthcheck:{test:['CMD','pg_isready','-U','postgres','-d',dbname],interval:'1s',timeout:'3s',retries:45}},
  s3:{image:images[1],command:'server /data',environment:{MINIO_ROOT_USER:key,MINIO_ROOT_PASSWORD:secret},ports:['127.0.0.1::9000'],volumes:['media:/data']},
},volumes:{database:{},media:{}}}),{mode:0o600})
const compose=(...args)=>run('docker-compose',['-p',project,'-f',manifest,...args])
const server=resolve(import.meta.dirname,'..'),root=resolve(server,'..')
let proc
try{
  compose('up','--pull','never','-d','--wait')
  const addr=compose('port','pg','5432'),s3addr=compose('port','s3','9000')
  for(const a of [addr,s3addr])assert.match(a,/^127\.0\.0\.1:\d+$/)
  const listener=createServer().listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r))
  const endpoint='http://'+s3addr,bucket=project+'-private',origin='http://127.0.0.1:'+port
  const env={...process.env,NODE_ENV:'test',BIND_HOST:'127.0.0.1',APP_ORIGIN:origin,PORT:String(port),DATABASE_URL:`postgresql://runtime:${runtimePassword}@${addr}/${dbname}`,MIGRATION_DATABASE_URL:`postgresql://postgres:${sqlPassword}@${addr}/${dbname}`,
    SESSION_SECRET:hex(32),S3_ENDPOINT:endpoint,S3_BUCKET:bucket,S3_ACCESS_KEY:key,S3_SECRET_KEY:secret,S3_REGION:'us-east-1',TEST_DB_ADDR:addr,TEST_DB_NAME:dbname,TEST_PROJECT:project,TMPDIR:dir}
  const db=new pg.Client({connectionString:env.MIGRATION_DATABASE_URL});await db.connect()
  try{await db.query(`CREATE ROLE runtime LOGIN PASSWORD '${runtimePassword}'`)}finally{await db.end()}
  const s3=new S3Client({region:'us-east-1',endpoint,forcePathStyle:true,credentials:{accessKeyId:key,secretAccessKey:secret}})
  async function ready(url){for(let i=0;i<100;i++){try{if((await fetch(url)).ok)return}catch{}await delay(100)}throw Error('Service not ready')}
  await ready(endpoint+'/minio/health/ready')
  try{await s3.send(new CreateBucketCommand({Bucket:bucket}))}finally{s3.destroy()}
  const command=(cmd,args,cwd=server)=>run(cmd,args,{cwd,env,stdio:'inherit'})
  command('npm',['run','generate']);command('npm',['run','build']);command('./node_modules/.bin/prisma',['migrate','deploy'])
  command(process.execPath,['dist/src/grants.js']);command('npm',['test'])
  run('npm',['run','build'],{cwd:root,env:{...env,NODE_ENV:'production'},stdio:'inherit'});command('npm',['test'],root)
  proc=spawn(process.execPath,['dist/src/main.js'],{cwd:server,env,stdio:'inherit'})
  await ready(origin+'/readyz')
  command(process.execPath,['tools/test-tenants.mjs'],root)
  command(process.execPath,['tests/rehearse.mjs'])
}finally{
  if(proc&&proc.exitCode===null){const closed=once(proc,'exit');proc.kill();await closed}
  compose('down')
  for(const suffix of ['database','media']){
    const volume=project+'_'+suffix
    if(run('docker',['volume','inspect',volume,'--format','{{index .Labels "com.docker.compose.project"}}'])===project)run('docker',['volume','rm',volume])
  }
  rmSync(dir,{recursive:true})
}
