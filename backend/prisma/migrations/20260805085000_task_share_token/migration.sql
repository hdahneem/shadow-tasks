-- AlterTable
ALTER TABLE "Task" ADD COLUMN "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Task_shareToken_key" ON "Task"("shareToken");
