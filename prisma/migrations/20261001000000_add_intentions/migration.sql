-- CreateEnum
CREATE TYPE "IntentionKind" AS ENUM ('TASK', 'GOAL', 'WISH');

-- CreateEnum
CREATE TYPE "Horizon" AS ENUM ('WEEK', 'MONTH', 'SOMEDAY');

-- CreateEnum
CREATE TYPE "IntentionStatus" AS ENUM ('SUGGESTED', 'ACTIVE', 'DONE', 'DROPPED', 'DISMISSED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSeenAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "intentionsExtractedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Intention" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT,
    "nodeId" TEXT,
    "text" TEXT NOT NULL,
    "sourceQuote" TEXT NOT NULL,
    "suggestedStep" TEXT,
    "kind" "IntentionKind" NOT NULL,
    "suggestedHorizon" "Horizon",
    "horizon" "Horizon",
    "status" "IntentionStatus" NOT NULL DEFAULT 'SUGGESTED',
    "dueAt" TIMESTAMP(3),
    "nextCheckInAt" TIMESTAMP(3),
    "snoozeUntil" TIMESTAMP(3),
    "embedding" DOUBLE PRECISION[],
    "lastSurfacedAt" TIMESTAMP(3),
    "lastInteractedAt" TIMESTAMP(3),
    "ignoredCount" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Intention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Intention_userId_status_idx" ON "Intention"("userId", "status");

-- CreateIndex
CREATE INDEX "Intention_entryId_idx" ON "Intention"("entryId");

-- AddForeignKey
ALTER TABLE "Intention" ADD CONSTRAINT "Intention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intention" ADD CONSTRAINT "Intention_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intention" ADD CONSTRAINT "Intention_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE SET NULL ON UPDATE CASCADE;

