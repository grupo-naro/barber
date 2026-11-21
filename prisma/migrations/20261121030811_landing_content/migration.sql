-- AlterTable
ALTER TABLE "Barbershop" ADD COLUMN     "coverImageKey" TEXT,
ADD COLUMN     "googleMapsUrl" TEXT,
ADD COLUMN     "instagram" TEXT;

-- CreateTable
CREATE TABLE "GalleryImage" (
    "id" TEXT NOT NULL,
    "barbershopId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "alt" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GalleryImage_storageKey_key" ON "GalleryImage"("storageKey");

-- CreateIndex
CREATE INDEX "GalleryImage_barbershopId_sortOrder_idx" ON "GalleryImage"("barbershopId", "sortOrder");

-- AddForeignKey
ALTER TABLE "GalleryImage" ADD CONSTRAINT "GalleryImage_barbershopId_fkey" FOREIGN KEY ("barbershopId") REFERENCES "Barbershop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
