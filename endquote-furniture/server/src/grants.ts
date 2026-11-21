import {PrismaClient} from './generated/client.js'
import {PrismaPg} from '@prisma/adapter-pg'
// One-shot provisioning for the fixed, non-owner Compose runtime role.
if(!process.env.MIGRATION_DATABASE_URL)throw new Error('Migration role required')
const db=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.MIGRATION_DATABASE_URL})})
try{
  await db.$transaction(async tx=>{
    await tx.$executeRaw`GRANT SELECT, INSERT, UPDATE, DELETE ON "MailToken","ProviderIdentity","AuthAttempt" TO runtime`
    await tx.$executeRaw`GRANT SELECT, INSERT ON "OrderNotification" TO runtime`
    await tx.$executeRaw`GRANT UPDATE ("nextAttemptAt","attempts","leaseUntil","sentAt") ON "OrderNotification" TO runtime`
    await tx.$executeRaw`GRANT USAGE ON SCHEMA public TO runtime`
    await tx.$executeRaw`GRANT SELECT ON "Owner","OwnerSession","Business","Slug","RateBucket","Customer","CleaningOrder","OrderLine","StatusEvent","Upload","PlatformAdmin","AdminSession" TO runtime`
    await tx.$executeRaw`GRANT INSERT ON "Owner","OwnerSession","Business","Slug","RateBucket","Customer","CleaningOrder","OrderLine","StatusEvent","Upload","AdminSession","AccessAudit" TO runtime`
    await tx.$executeRaw`GRANT UPDATE ("normalizedEmail","passwordHash","verifiedAt","hasPassword") ON "Owner" TO runtime`
    await tx.$executeRaw`GRANT UPDATE ("idleExpiresAt","revokedAt") ON "OwnerSession" TO runtime`
    await tx.$executeRaw`GRANT UPDATE ("name","slug","city","area","phone","description","social","logoId","published","catalog","catalogRevision","accessState","accessVersion","trialEndsAt","paidThrough") ON "Business" TO runtime`
    await tx.$executeRaw`GRANT UPDATE ("name") ON "Customer" TO runtime`
    await tx.$executeRaw`GRANT UPDATE ("status") ON "CleaningOrder" TO runtime`
    await tx.$executeRaw`GRANT UPDATE ("state","orderId") ON "Upload" TO runtime`
    await tx.$executeRaw`GRANT UPDATE ("idleExpiresAt","mfaAt","reauthAt") ON "AdminSession" TO runtime`
    await tx.$executeRaw`GRANT UPDATE ("totpPending","totpCiphertext","totpEnabledAt","lastTotpStep") ON "PlatformAdmin" TO runtime`
    await tx.$executeRaw`GRANT SELECT ("id","businessId","adminId","prior","next","createdAt","reason") ON "AccessAudit" TO runtime`
    await tx.$executeRaw`GRANT UPDATE ("hits") ON "RateBucket" TO runtime`
    await tx.$executeRaw`GRANT DELETE ON "Upload","RateBucket","AdminSession" TO runtime`
  })
}finally{await db.$disconnect()}
