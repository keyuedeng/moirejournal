-- CreateEnum
CREATE TYPE "EntryStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "status" "EntryStatus" NOT NULL DEFAULT 'PENDING';

-- Backfill: every entry that already exists predates the background
-- pipeline change and was fully processed synchronously before its POST
-- request ever returned, so it's safe (and correct) to mark it PROCESSED
-- rather than leave it stuck showing "processing" forever.
UPDATE "Entry" SET "status" = 'PROCESSED';
