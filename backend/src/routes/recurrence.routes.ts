import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { logActivity } from '../services/activity.service.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const recurrenceRouter = Router();
recurrenceRouter.use(requireAuth);

async function findOwnedRule(ruleId: string, userId: string) {
  const rule = await prisma.recurrenceRule.findFirst({ where: { id: ruleId } });
  if (!rule) return null;
  const list = await prisma.todoList.findFirst({ where: { id: rule.listId }, include: { project: true } });
  if (!list) return null;
  const role = await getMemberRole(list.project.workspaceId, userId, list.projectId);
  if (!roleAtLeast(role, 'member')) return null;
  return rule;
}

/** For activity-log visibility: the most recently created occurrence in the series. */
async function latestOccurrence(ruleId: string) {
  return prisma.task.findFirst({ where: { recurrenceRuleId: ruleId }, orderBy: { createdAt: 'desc' } });
}

// Frequency/mode are fixed at creation — change them by stopping this rule and
// starting a fresh one, which keeps nextRunAt/occurrenceCount unambiguous.
const recurrenceUpdateSchema = z.object({
  interval: z.number().int().min(1).max(365).optional(),
  skipWeekends: z.boolean().optional(),
  endDate: z.string().datetime().nullable().optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
});

recurrenceRouter.patch('/:id', validateBody(recurrenceUpdateSchema), async (req: AuthedRequest, res) => {
  const rule = await findOwnedRule(req.params.id, req.userId!);
  if (!rule) return res.status(404).json({ error: 'Recurrence rule not found' });

  const body = req.body as z.infer<typeof recurrenceUpdateSchema>;
  const data: Record<string, unknown> = { ...body };
  if ('endDate' in body) data.endDate = body.endDate ? new Date(body.endDate) : null;

  const updated = await prisma.recurrenceRule.update({ where: { id: rule.id }, data });

  const latest = await latestOccurrence(rule.id);
  if (latest) await logActivity(latest.id, req.userId!, 'recurrence_updated', {});

  res.json(updated);
});

recurrenceRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const rule = await findOwnedRule(req.params.id, req.userId!);
  if (!rule) return res.status(404).json({ error: 'Recurrence rule not found' });

  await prisma.recurrenceRule.update({ where: { id: rule.id }, data: { active: false } });

  const latest = await latestOccurrence(rule.id);
  if (latest) await logActivity(latest.id, req.userId!, 'recurrence_stopped', {});

  res.status(204).send();
});
