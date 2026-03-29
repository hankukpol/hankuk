-- Drop if exists (cleanup from failed attempts)
DROP TABLE IF EXISTS "textbook_sales";

-- Create textbook_sales table for tracking textbook sales
CREATE TABLE "textbook_sales" (
    "id" SERIAL PRIMARY KEY,
    "textbookId" INTEGER NOT NULL,
    "examNumber" TEXT,
    "staffId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL,
    "totalPrice" INTEGER NOT NULL,
    "note" TEXT,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Foreign key constraints
ALTER TABLE "textbook_sales"
    ADD CONSTRAINT "textbook_sales_textbookId_fkey"
    FOREIGN KEY ("textbookId") REFERENCES "textbooks"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "textbook_sales"
    ADD CONSTRAINT "textbook_sales_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "admin_users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "textbook_sales_textbookId_idx" ON "textbook_sales"("textbookId");
CREATE INDEX IF NOT EXISTS "textbook_sales_soldAt_idx" ON "textbook_sales"("soldAt");
CREATE INDEX IF NOT EXISTS "textbook_sales_examNumber_idx" ON "textbook_sales"("examNumber");
