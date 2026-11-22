-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('MERCADOPAGO', 'MANUAL');

-- AlterTable
ALTER TABLE "Barbershop" ADD COLUMN     "billingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthlyAmount" DECIMAL(12,2),
ADD COLUMN     "mpInitPoint" TEXT,
ADD COLUMN     "mpPreapprovalId" TEXT,
ADD COLUMN     "mpStatus" TEXT,
ADD COLUMN     "payerEmail" TEXT;

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "source" "PaymentSource" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "coversUntil" TIMESTAMP(3) NOT NULL,
    "mpPaymentId" TEXT,
    "note" TEXT,
    "createdByAdminId" TEXT,
    "suspectedDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "duplicateReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "transferAlias" TEXT,
    "transferCbu" TEXT,
    "transferHolder" TEXT,
    "contactWhatsapp" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_mpPaymentId_key" ON "SubscriptionPayment"("mpPaymentId");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_barbershopId_idx" ON "SubscriptionPayment"("barbershopId");

-- CreateIndex
CREATE UNIQUE INDEX "Barbershop_mpPreapprovalId_key" ON "Barbershop"("mpPreapprovalId");

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
