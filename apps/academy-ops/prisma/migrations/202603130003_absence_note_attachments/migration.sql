CREATE TABLE "absence_note_attachments" (
    "id" SERIAL NOT NULL,
    "noteId" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "uploadedByAdminId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absence_note_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "absence_note_attachments_bucket_storagePath_key" ON "absence_note_attachments"("bucket", "storagePath");
CREATE INDEX "absence_note_attachments_noteId_createdAt_idx" ON "absence_note_attachments"("noteId", "createdAt");

ALTER TABLE "absence_note_attachments"
    ADD CONSTRAINT "absence_note_attachments_noteId_fkey"
    FOREIGN KEY ("noteId") REFERENCES "absence_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "absence_note_attachments"
    ADD CONSTRAINT "absence_note_attachments_uploadedByAdminId_fkey"
    FOREIGN KEY ("uploadedByAdminId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
