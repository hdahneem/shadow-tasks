/*
  Warnings:

  - Made the column `workspaceId` on table `Folder` required. This step will fail if there are existing NULL values in that column.
  - Made the column `workspaceId` on table `Project` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Folder" ALTER COLUMN "workspaceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Project" ALTER COLUMN "workspaceId" SET NOT NULL;
