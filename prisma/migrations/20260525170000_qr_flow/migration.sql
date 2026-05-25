-- Drop the purchase-intent QR approval flow now that staff charge wristbands
-- directly after scanning them. The PurchaseIntent and PurchaseIntentLine
-- tables and the PurchaseIntentStatus enum are no longer used.

-- DropForeignKey
ALTER TABLE "PurchaseIntentLine" DROP CONSTRAINT IF EXISTS "PurchaseIntentLine_itemId_fkey";
ALTER TABLE "PurchaseIntentLine" DROP CONSTRAINT IF EXISTS "PurchaseIntentLine_purchaseIntentId_fkey";
ALTER TABLE "PurchaseIntent" DROP CONSTRAINT IF EXISTS "PurchaseIntent_approvedByUserId_fkey";
ALTER TABLE "PurchaseIntent" DROP CONSTRAINT IF EXISTS "PurchaseIntent_shopId_fkey";
ALTER TABLE "PurchaseIntent" DROP CONSTRAINT IF EXISTS "PurchaseIntent_staffId_fkey";
ALTER TABLE "PurchaseIntent" DROP CONSTRAINT IF EXISTS "PurchaseIntent_wristbandId_fkey";

-- DropTable
DROP TABLE IF EXISTS "PurchaseIntentLine";
DROP TABLE IF EXISTS "PurchaseIntent";

-- DropEnum
DROP TYPE IF EXISTS "PurchaseIntentStatus";

-- Drop the now-unused Google OAuth column on User. The flow now goes
-- through wristband scan + registration form only.
DROP INDEX IF EXISTS "User_googleSub_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "googleSub";

-- Make Wristband.userId nullable so admins can pre-generate blank
-- wristbands and hand them out at the gate. The first attendee scan
-- attaches a freshly registered user to it.
ALTER TABLE "Wristband" DROP CONSTRAINT IF EXISTS "Wristband_userId_fkey";
ALTER TABLE "Wristband" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Wristband" ADD CONSTRAINT "Wristband_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
