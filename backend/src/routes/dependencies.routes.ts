import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { logActivity } from '../services/activity.service.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const dependenciesRouter = Router();
dependenciesRouter.use(requireAuth);

dependenciesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const dependency = await prisma.taskDependency.findFirst({
    where: { id: req.params.id },
    include: {
      predecessor: { select: { id: true, title: true } },
      successor: { include: { list: { include: { project: true } } } },
    },
  });
  if (!dependency) return res.status(404).json({ error: 'Dependency not found' });

  const role = await getMemberRole(
    dependency.successor.list.project.workspaceId,
    req.userId!,
    dependency.successor.list.projectId
  );
  if (!roleAtLeast(role, 'member')) return res.status(404).json({ error: 'Dependency not found' });

  await prisma.taskDependency.delete({ where: { id: dependency.id } });
  await logActivity(dependency.successor.id, req.userId!, 'dependency_removed', {
    predecessorId: dependency.predecessor.id,
    title: dependency.predecessor.title,
  });

  res.status(204).send();
});
