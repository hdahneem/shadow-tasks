import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { logActivity } from '../services/activity.service.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const timeEntriesRouter = Router();
timeEntriesRouter.use(requireAuth);

async function findOwnedEntry(entryId: string, userId: string) {
  const entry = await prisma.timeEntry.findFirst({
    where: { id: entryId },
    include: { task: { include: { list: { include: { project: true } } } } },
  });
  if (!entry) return null;
  const role = await getMemberRole(entry.task.list.project.workspaceId, userId, entry.task.list.projectId);
  if (!roleAtLeast(role, 'member')) return null;
  return entry;
}

const timeEntryUpdateSchema = z
  .object({
    startedAt: z.string().datetime().optional(),
    endedAt: z.string().datetime().nullable().optional(),
    note: z.string().max(2000).nullable().optional(),
  })
  .refine(
    (data) =>
      !(data.startedAt && data.endedAt) || new Date(data.endedAt as string) > new Date(data.startedAt),
    { message: 'End time must be after start time', path: ['endedAt'] }
  );

timeEntriesRouter.patch('/:id', validateBody(timeEntryUpdateSchema), async (req: AuthedRequest, res) => {
  const entry = await findOwnedEntry(req.params.id, req.userId!);
  if (!entry) return res.status(404).json({ error: 'Time entry not found' });

  const body = req.body as z.infer<typeof timeEntryUpdateSchema>;
  const data: Record<string, unknown> = { ...body };
  if ('startedAt' in body && body.startedAt) data.startedAt = new Date(body.startedAt);
  if ('endedAt' in body) data.endedAt = body.endedAt ? new Date(body.endedAt) : null;

  const nextStart = data.startedAt ? (data.startedAt as Date) : entry.startedAt;
  const nextEnd = 'endedAt' in data ? (data.endedAt as Date | null) : entry.endedAt;
  if (nextEnd && nextEnd <= nextStart) {
    return res.status(400).json({ error: 'End time must be after start time' });
  }

  const updated = await prisma.timeEntry.update({ where: { id: entry.id }, data });
  res.json(updated);
});

timeEntriesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const entry = await findOwnedEntry(req.params.id, req.userId!);
  if (!entry) return res.status(404).json({ error: 'Time entry not found' });

  await prisma.timeEntry.delete({ where: { id: entry.id } });
  await logActivity(entry.taskId, req.userId!, 'time_entry_removed', {});

  res.status(204).send();
});
