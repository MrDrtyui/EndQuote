-- Persist a notification event in the same transaction that creates a customer order.
-- Runtime may insert and update delivery state but does not need DELETE permission.
CREATE TABLE "OrderNotification" (
  "orderId" UUID NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "businessName" TEXT NOT NULL,
  "total" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "leaseUntil" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "OrderNotification_pkey" PRIMARY KEY ("orderId")
);
CREATE INDEX "OrderNotification_sentAt_nextAttemptAt_idx" ON "OrderNotification" ("sentAt", "nextAttemptAt");
ALTER TABLE "OrderNotification"
  ADD CONSTRAINT "OrderNotification_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "CleaningOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
