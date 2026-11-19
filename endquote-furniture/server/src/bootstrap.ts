import {createInterface} from 'node:readline/promises'
import {execFileSync} from 'node:child_process'
import argon2 from 'argon2'
import {z} from 'zod'
import {PrismaClient} from './generated/client.js'
import {PrismaPg} from '@prisma/adapter-pg'
if(!process.stdin.isTTY||process.argv.length!==2||!process.env.MIGRATION_DATABASE_URL)throw Error('Use an interactive operator terminal with MIGRATION_DATABASE_URL configured.')
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.MIGRATION_DATABASE_URL})})
const rl=createInterface({input:process.stdin,output:process.stderr,terminal:false})
let hidden=false
function restore(){if(hidden){execFileSync('stty',['echo'],{stdio:['inherit','ignore','ignore']});hidden=false}}
process.once('exit',restore)
for(const s of ['SIGINT','SIGTERM'])process.once(s,()=>{restore();process.exit(1)})
try{
  const email=z.email().max(254).parse((await rl.question('Admin email: ')).trim().toLowerCase())
  execFileSync('stty',['-echo'],{stdio:['inherit','ignore','ignore']});hidden=true
  const password=await rl.question('Password (12–128 characters): ');restore();process.stderr.write('\n')
  if(password.length<12||password.length>128)throw Error('Invalid length')
  const passwordHash=await argon2.hash(password,{type:argon2.argon2id})
  await db.$transaction(async tx=>{
    await tx.$executeRaw`LOCK TABLE "PlatformAdmin" IN EXCLUSIVE MODE`
    if(await tx.platformAdmin.count())throw Error('Already bootstrapped')
    await tx.platformAdmin.create({data:{email,passwordHash}})
  })
}catch{console.error('Administrator was not created. Check credentials, database and existing bootstrap.');process.exitCode=1}
finally{restore();rl.close();await db.$disconnect()}
