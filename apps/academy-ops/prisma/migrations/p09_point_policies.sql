-- CreateTable
CREATE TABLE "point_policies" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultAmount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "point_policies_isActive_idx" ON "point_policies"("isActive");
