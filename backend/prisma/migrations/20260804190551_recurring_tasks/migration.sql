-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('daily', 'weekly', 'monthly', 'yearly');

-- CreateEnum
CREATE TYPE "RecurrenceMode" AS ENUM ('after_completion', 'fixed_schedule');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "recurrenceRuleId" TEXT;

-- CreateTable
CREATE TABLE "RecurrenceRule" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "mode" "RecurrenceMode" NOT NULL DEFAULT 'after_completion',
    "skipWeekends" BOOLEAN NOT NULL DEFAULT false,
    "endDate" TIMESTAMP(3),
    "maxOccurrences" INTEGER,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "nextRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurrenceRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurrenceRule_listId_idx" ON "RecurrenceRule"("listId");

-- CreateIndex
CREATE INDEX "RecurrenceRule_active_nextRunAt_idx" ON "RecurrenceRule"("active", "nextRunAt");

-- CreateIndex
CREATE INDEX "Task_recurrenceRuleId_idx" ON "Task"("recurrenceRuleId");

-- AddForeignKey
ALTER TABLE "RecurrenceRule" ADD CONSTRAINT "RecurrenceRule_listId_fkey" FOREIGN KEY ("listId") REFERENCES "TodoList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrenceRuleId_fkey" FOREIGN KEY ("recurrenceRuleId") REFERENCES "RecurrenceRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
