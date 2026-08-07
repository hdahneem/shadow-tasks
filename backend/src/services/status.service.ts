import { prisma } from '../lib/prisma.js';

export async function createDefaultStatuses(projectId: string) {
  return prisma.$transaction([
    prisma.status.create({
      data: { projectId, name: 'To Do', color: '#7c93b3', position: 1, isCompleted: false },
    }),
    prisma.status.create({
      data: { projectId, name: 'In Progress', color: '#22d3ee', position: 2, isCompleted: false },
    }),
    prisma.status.create({
      data: { projectId, name: 'Done', color: '#4ade80', position: 3, isCompleted: true },
    }),
  ]);
}

/** The status a task should land on when toggled done/not-done directly (checkbox shortcut). */
export async function getDefaultStatusId(projectId: string, completed: boolean): Promise<string | null> {
  const status = await prisma.status.findFirst({
    where: { projectId, isCompleted: completed },
    orderBy: { position: 'asc' },
  });
  return status?.id ?? null;
}
