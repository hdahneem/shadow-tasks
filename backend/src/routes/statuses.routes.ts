import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const statusesRouter = Router();
statusesRouter.use(requireAuth);

async function findOwnedStatus(statusId: string, userId: string) {
  const status = await prisma.status.findFirst({ where: { id: statusId }, include: { project: true } });
  if (!status) return null;
  const role = await getMemberRole(status.project.workspaceId, userId, status.projectId);
  if (!roleAtLeast(role, 'admin')) return null;
  return status;
}

const updateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().min(1).max(32).optional(),
  position: z.number().optional(),
  isCompleted: z.boolean().optional(),
});

statusesRouter.patch('/:id', validateBody(updateSchema), async (req: AuthedRequest, res) => {
  const status = await findOwnedStatus(req.params.id, req.userId!);
  if (!status) return res.status(404).json({ error: 'Status not found' });

  const updated = await prisma.status.update({ where: { id: status.id }, data: req.body });
  res.json(updated);
});

statusesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const status = await findOwnedStatus(req.params.id, req.userId!);
  if (!status) return res.status(404).json({ error: 'Status not found' });

  const [taskCount, statusCount] = await Promise.all([
    prisma.task.count({ where: { statusId: status.id } }),
    prisma.status.count({ where: { projectId: status.projectId } }),
  ]);
  if (taskCount > 0) {
    return res.status(400).json({ error: 'Move tasks off this status before deleting it' });
  }
  if (statusCount <= 1) {
    return res.status(400).json({ error: 'A project needs at least one status' });
  }

  await prisma.status.delete({ where: { id: status.id } });
  res.status(204).send();
});
