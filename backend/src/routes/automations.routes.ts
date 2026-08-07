import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const automationsRouter = Router();
automationsRouter.use(requireAuth);

async function findOwnedAutomation(automationId: string, userId: string) {
  const automation = await prisma.automation.findFirst({
    where: { id: automationId },
    include: { project: true },
  });
  if (!automation) return null;
  const role = await getMemberRole(automation.project.workspaceId, userId, automation.projectId);
  if (!roleAtLeast(role, 'admin')) return null;
  return automation;
}

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  enabled: z.boolean().optional(),
  triggerType: z.enum(['task_created', 'status_changed_to', 'task_completed', 'assignee_added']).optional(),
  triggerConfig: z.record(z.string(), z.unknown()).optional(),
  actionType: z.enum(['set_status', 'set_priority', 'assign_user', 'add_comment', 'add_tag']).optional(),
  actionConfig: z.record(z.string(), z.unknown()).optional(),
});

automationsRouter.patch('/:id', validateBody(updateSchema), async (req: AuthedRequest, res) => {
  const automation = await findOwnedAutomation(req.params.id, req.userId!);
  if (!automation) return res.status(404).json({ error: 'Automation not found' });

  const updated = await prisma.automation.update({
    where: { id: automation.id },
    data: req.body as never,
  });
  res.json(updated);
});

automationsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const automation = await findOwnedAutomation(req.params.id, req.userId!);
  if (!automation) return res.status(404).json({ error: 'Automation not found' });

  await prisma.automation.delete({ where: { id: automation.id } });
  res.status(204).send();
});
