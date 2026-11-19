-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_id_logoId_fkey" FOREIGN KEY ("id", "logoId") REFERENCES "Upload"("businessId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
