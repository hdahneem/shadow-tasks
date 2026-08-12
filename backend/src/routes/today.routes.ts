import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const todayRouter = Router();
todayRouter.use(requireAuth);

/** UTC date string ('YYYY-MM-DD'), matching the frontend's lib/calendar.ts
 * todayKey() convention exactly, so a task with startDate at UTC midnight
 * today is treated identically on both sides. */
function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

todayRouter.get('/entries', async (req: AuthedRequest, res) => {
  const date = todayKey();
  const entries = await prisma.todayListEntry.findMany({
    where: { userId: req.userId!, date },
    select: { taskId: true, status: true },
  });
  res.json({ date, entries });
});

const upsertSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(['added', 'dismissed']),
});

todayRouter.post('/entries', validateBody(upsertSchema), async (req: AuthedRequest, res) => {
  const task = await prisma.task.findFirst({
    where: { id: req.body.taskId },
    include: { list: { include: { project: true } } },
  });
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const role = await getMemberRole(task.list.project.workspaceId, req.userId!, task.list.projectId);
  if (!roleAtLeast(role, 'viewer')) return res.status(404).json({ error: 'Task not found' });

  const date = todayKey();
  const entry = await prisma.todayListEntry.upsert({
    where: { userId_taskId_date: { userId: req.userId!, taskId: task.id, date } },
    update: { status: req.body.status },
    create: { userId: req.userId!, taskId: task.id, date, status: req.body.status },
  });
  res.json({ taskId: entry.taskId, status: entry.status });
});
