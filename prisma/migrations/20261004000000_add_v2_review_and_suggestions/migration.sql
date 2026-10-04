-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISMISSED', 'MUTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastReviewOpenedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Node" ADD COLUMN     "suggestionSnoozedUntil" TIMESTAMP(3),
ADD COLUMN     "suggestionsMutedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PatternSuggestion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "observation" TEXT NOT NULL,
    "goalText" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "entryId" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
    "intentionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PatternSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatternSuggestion_userId_status_idx" ON "PatternSuggestion"("userId", "status");

-- AddForeignKey
ALTER TABLE "PatternSuggestion" ADD CONSTRAINT "PatternSuggestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PatternSuggestion" ADD CONSTRAINT "PatternSuggestion_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "Node"("id") ON DELETE CASCADE ON UPDATE CASCADE;

