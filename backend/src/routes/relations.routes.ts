import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { logActivity } from '../services/activity.service.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const relationsRouter = Router();
relationsRouter.use(requireAuth);

relationsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const relation = await prisma.taskRelation.findFirst({
    where: { id: req.params.id },
    include: {
      relatedTask: { select: { id: true, title: true } },
      task: { include: { list: { include: { project: true } } } },
    },
  });
  if (!relation) return res.status(404).json({ error: 'Relation not found' });

  const role = await getMemberRole(
    relation.task.list.project.workspaceId,
    req.userId!,
    relation.task.list.projectId
  );
  if (!roleAtLeast(role, 'member')) return res.status(404).json({ error: 'Relation not found' });

  await prisma.taskRelation.delete({ where: { id: relation.id } });
  await logActivity(relation.task.id, req.userId!, 'relation_removed', {
    relatedTaskId: relation.relatedTask.id,
    title: relation.relatedTask.title,
  });

  res.status(204).send();
});
