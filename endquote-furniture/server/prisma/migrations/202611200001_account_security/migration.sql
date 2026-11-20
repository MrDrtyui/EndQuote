ALTER TABLE "Owner" ADD COLUMN "verifiedAt" TIMESTAMP(3), ADD COLUMN "hasPassword" BOOLEAN NOT NULL DEFAULT true;
CREATE TABLE "MailToken" (
  "hash" TEXT PRIMARY KEY, "ownerId" UUID NOT NULL REFERENCES "Owner"(id) ON DELETE CASCADE,
  "purpose" TEXT NOT NULL, "email" TEXT NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL,
  UNIQUE ("ownerId","purpose")
);
CREATE TABLE "ProviderIdentity" (
  "provider" TEXT NOT NULL, "subject" TEXT NOT NULL, "ownerId" UUID NOT NULL REFERENCES "Owner"(id) ON DELETE CASCADE,
  PRIMARY KEY ("provider","subject"), UNIQUE ("ownerId","provider")
);
CREATE TABLE "AuthAttempt" (
  "stateHash" TEXT PRIMARY KEY, "browserHash" TEXT NOT NULL, "provider" TEXT NOT NULL,
  "sessionHash" TEXT, "expiresAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "AuthAttempt_expiresAt_idx" ON "AuthAttempt" ("expiresAt");
