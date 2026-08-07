import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const listsRouter = Router();
listsRouter.use(requireAuth);

listsRouter.get('/', async (req: AuthedRequest, res) => {
  const lists = await prisma.todoList.findMany({
    where: { project: { workspace: { members: { some: { userId: req.userId } } } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(lists);
});

/** Resolves a list the user belongs to (via its project's workspace) at member role or above. */
async function findMemberList(listId: string, userId: string) {
  const list = await prisma.todoList.findFirst({ where: { id: listId }, include: { project: true } });
  if (!list) return null;
  const role = await getMemberRole(list.project.workspaceId, userId, list.projectId);
  if (!roleAtLeast(role, 'member')) return null;
  return list;
}

const updateSchema = z.object({ name: z.string().min(1).max(120) });

listsRouter.patch('/:id', validateBody(updateSchema), async (req: AuthedRequest, res) => {
  const list = await findMemberList(req.params.id, req.userId!);
  if (!list) return res.status(404).json({ error: 'List not found' });

  const updated = await prisma.todoList.update({ where: { id: list.id }, data: req.body });
  res.json(updated);
});

listsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const list = await findMemberList(req.params.id, req.userId!);
  if (!list) return res.status(404).json({ error: 'List not found' });

  await prisma.todoList.delete({ where: { id: list.id } });
  res.status(204).send();
});
