-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('related', 'duplicate', 'child_project', 'parent_initiative', 'bug', 'requirement', 'documentation');

-- CreateTable
CREATE TABLE "TaskRelation" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "relatedTaskId" TEXT NOT NULL,
    "type" "RelationType" NOT NULL DEFAULT 'related',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskRelation_taskId_idx" ON "TaskRelation"("taskId");

-- CreateIndex
CREATE INDEX "TaskRelation_relatedTaskId_idx" ON "TaskRelation"("relatedTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskRelation_taskId_relatedTaskId_key" ON "TaskRelation"("taskId", "relatedTaskId");

-- AddForeignKey
ALTER TABLE "TaskRelation" ADD CONSTRAINT "TaskRelation_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskRelation" ADD CONSTRAINT "TaskRelation_relatedTaskId_fkey" FOREIGN KEY ("relatedTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
