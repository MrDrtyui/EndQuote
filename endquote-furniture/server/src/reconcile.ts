import {PrismaPg} from '@prisma/adapter-pg'
import {PrismaClient} from './generated/client.js'
import {media} from './storage.js'
if(!process.env.DATABASE_URL||!process.env.S3_BUCKET||!process.env.S3_ACCESS_KEY||!process.env.S3_SECRET_KEY)throw Error('Configure database and dedicated private bucket.')
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})})
const files=media(db)
try{await files.cleanup();await files.reconcile()}
finally{files.close();await db.$disconnect()}
