-- CreateEnum
CREATE TYPE "PurchaseIntentStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'EXPIRED');

-- CreateTable
CREATE TABLE "PurchaseIntent" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "PurchaseIntentStatus" NOT NULL DEFAULT 'PENDING',
    "staffId" TEXT,
    "shopId" TEXT,
    "approvedByUserId" TEXT,
    "wristbandId" TEXT,
    "totalCredits" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseIntentLine" (
    "id" TEXT NOT NULL,
    "purchaseIntentId" TEXT NOT NULL,
    "itemId" TEXT,
    "itemName" TEXT NOT NULL,
    "unitPriceCredits" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "lineTotalCredits" INTEGER NOT NULL,
    "ageRestricted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseIntentLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseIntent_token_key" ON "PurchaseIntent"("token");

-- CreateIndex
CREATE INDEX "PurchaseIntent_status_expiresAt_idx" ON "PurchaseIntent"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "PurchaseIntent_staffId_createdAt_idx" ON "PurchaseIntent"("staffId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseIntent_approvedByUserId_createdAt_idx" ON "PurchaseIntent"("approvedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseIntentLine_purchaseIntentId_idx" ON "PurchaseIntentLine"("purchaseIntentId");

-- AddForeignKey
ALTER TABLE "PurchaseIntent" ADD CONSTRAINT "PurchaseIntent_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntent" ADD CONSTRAINT "PurchaseIntent_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntent" ADD CONSTRAINT "PurchaseIntent_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntent" ADD CONSTRAINT "PurchaseIntent_wristbandId_fkey" FOREIGN KEY ("wristbandId") REFERENCES "Wristband"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentLine" ADD CONSTRAINT "PurchaseIntentLine_purchaseIntentId_fkey" FOREIGN KEY ("purchaseIntentId") REFERENCES "PurchaseIntent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseIntentLine" ADD CONSTRAINT "PurchaseIntentLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
