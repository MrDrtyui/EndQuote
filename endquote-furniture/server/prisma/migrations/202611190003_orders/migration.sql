-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "logoId" UUID,
ADD COLUMN     "social" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleaningOrder" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'new',
    "contact" JSONB NOT NULL,
    "businessName" TEXT NOT NULL,
    "consentVersion" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "revision" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "session" TEXT NOT NULL,
    "attempt" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "receipt" TEXT NOT NULL,

    CONSTRAINT "CleaningOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatusEvent" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "actor" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "from" TEXT NOT NULL,
    "to" TEXT NOT NULL,

    CONSTRAINT "StatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Upload" (
    "id" UUID NOT NULL,
    "businessId" UUID NOT NULL,
    "orderId" UUID,
    "purpose" TEXT NOT NULL,
    "session" TEXT NOT NULL,
    "attempt" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Upload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_phone_key" ON "Customer"("businessId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_businessId_id_key" ON "Customer"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningOrder_receipt_key" ON "CleaningOrder"("receipt");

-- CreateIndex
CREATE INDEX "CleaningOrder_businessId_createdAt_id_idx" ON "CleaningOrder"("businessId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningOrder_businessId_id_key" ON "CleaningOrder"("businessId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "CleaningOrder_businessId_session_attempt_key" ON "CleaningOrder"("businessId", "session", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLine_businessId_orderId_position_key" ON "OrderLine"("businessId", "orderId", "position");

-- CreateIndex
CREATE INDEX "StatusEvent_businessId_orderId_idx" ON "StatusEvent"("businessId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_key_key" ON "Upload"("key");

-- CreateIndex
CREATE INDEX "Upload_businessId_session_attempt_idx" ON "Upload"("businessId", "session", "attempt");

-- CreateIndex
CREATE UNIQUE INDEX "Upload_businessId_id_key" ON "Upload"("businessId", "id");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningOrder" ADD CONSTRAINT "CleaningOrder_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleaningOrder" ADD CONSTRAINT "CleaningOrder_businessId_customerId_fkey" FOREIGN KEY ("businessId", "customerId") REFERENCES "Customer"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_businessId_orderId_fkey" FOREIGN KEY ("businessId", "orderId") REFERENCES "CleaningOrder"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatusEvent" ADD CONSTRAINT "StatusEvent_businessId_orderId_fkey" FOREIGN KEY ("businessId", "orderId") REFERENCES "CleaningOrder"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Upload" ADD CONSTRAINT "Upload_businessId_orderId_fkey" FOREIGN KEY ("businessId", "orderId") REFERENCES "CleaningOrder"("businessId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
