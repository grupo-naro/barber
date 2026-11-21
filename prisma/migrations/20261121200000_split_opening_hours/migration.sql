-- DropIndex
DROP INDEX "OpeningHours_barbershopId_weekday_key";

-- CreateIndex
CREATE UNIQUE INDEX "OpeningHours_barbershopId_weekday_opensAt_key" ON "OpeningHours"("barbershopId", "weekday", "opensAt");

