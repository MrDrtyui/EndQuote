-- Admin MFA secrets are encrypted at the application layer with ADMIN_TOTP_KEY.
-- NULL MFA fields allow existing administrators to complete enrollment on next login.
ALTER TABLE "PlatformAdmin"
  ADD COLUMN "totpPending" TEXT,
  ADD COLUMN "totpCiphertext" TEXT,
  ADD COLUMN "totpEnabledAt" TIMESTAMP(3),
  ADD COLUMN "lastTotpStep" INTEGER;
ALTER TABLE "AdminSession"
  ADD COLUMN "mfaAt" TIMESTAMP(3),
  ADD COLUMN "reauthAt" TIMESTAMP(3);
