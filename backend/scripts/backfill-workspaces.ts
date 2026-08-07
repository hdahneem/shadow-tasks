/**
 * One-off backfill for the workspaces migration: every user who isn't yet a
 * member of any workspace gets a personal workspace (as owner), and all of
 * their existing folders/projects that don't yet belong to a workspace are
 * attached to it. Safe to re-run: users with an existing membership, and
 * folders/projects that already have a workspaceId, are skipped.
 */
import { prisma } from '../src/lib/prisma.js';

async function main() {
  const users = await prisma.user.findMany({ include: { workspaceMemberships: true } });
  let workspacesCreated = 0;
  let foldersBackfilled = 0;
  let projectsBackfilled = 0;

  for (const user of users) {
    if (user.workspaceMemberships.length > 0) continue;

    const workspace = await prisma.workspace.create({
      data: {
        name: `${user.name}'s Workspace`,
        ownerId: user.id,
        members: { create: { userId: user.id, role: 'owner' } },
      },
    });
    workspacesCreated += 1;

    const folders = await prisma.folder.updateMany({
      where: { ownerId: user.id, workspaceId: null },
      data: { workspaceId: workspace.id },
    });
    const projects = await prisma.project.updateMany({
      where: { ownerId: user.id, workspaceId: null },
      data: { workspaceId: workspace.id },
    });
    foldersBackfilled += folders.count;
    projectsBackfilled += projects.count;
  }

  console.log(
    `Created ${workspacesCreated} workspace(s), backfilled ${foldersBackfilled} folder(s) and ${projectsBackfilled} project(s).`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
