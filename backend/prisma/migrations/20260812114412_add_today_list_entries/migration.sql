-- CreateEnum
CREATE TYPE "TodayEntryStatus" AS ENUM ('added', 'dismissed');

-- CreateTable
CREATE TABLE "TodayListEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "TodayEntryStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TodayListEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TodayListEntry_userId_date_idx" ON "TodayListEntry"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "TodayListEntry_userId_taskId_date_key" ON "TodayListEntry"("userId", "taskId", "date");

-- AddForeignKey
ALTER TABLE "TodayListEntry" ADD CONSTRAINT "TodayListEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TodayListEntry" ADD CONSTRAINT "TodayListEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
