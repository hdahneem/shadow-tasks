import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const tagsRouter = Router();
tagsRouter.use(requireAuth);

/** Tags are a shared workspace-wide taxonomy — renaming/deleting one affects every task
 * it's attached to, so those actions need admin+, while creating a new one and attaching
 * it to a task you can already edit stays at member+, same friction as picking an assignee. */
async function findAdminTag(tagId: string, userId: string) {
  const tag = await prisma.tag.findFirst({ where: { id: tagId } });
  if (!tag) return null;
  const role = await getMemberRole(tag.workspaceId, userId);
  if (!roleAtLeast(role, 'admin')) return null;
  return tag;
}

tagsRouter.get('/', async (req: AuthedRequest, res) => {
  const workspaceId = req.query.workspaceId as string | undefined;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

  const role = await getMemberRole(workspaceId, req.userId!);
  if (!roleAtLeast(role, 'viewer')) return res.status(404).json({ error: 'Workspace not found' });

  const tags = await prisma.tag.findMany({ where: { workspaceId }, orderBy: { name: 'asc' } });
  res.json(tags);
});

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(40),
  color: z.string().min(1).max(32).default('#22d3ee'),
});

tagsRouter.post('/', validateBody(createSchema), async (req: AuthedRequest, res) => {
  const role = await getMemberRole(req.body.workspaceId, req.userId!);
  if (!roleAtLeast(role, 'member')) return res.status(404).json({ error: 'Workspace not found' });

  try {
    const tag = await prisma.tag.create({
      data: { workspaceId: req.body.workspaceId, name: req.body.name, color: req.body.color },
    });
    res.status(201).json(tag);
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A tag with that name already exists in this workspace' });
    }
    throw err;
  }
});

const updateSchema = z.object({
  name: z.string().min(1).max(40).optional(),
  color: z.string().min(1).max(32).optional(),
});

tagsRouter.patch('/:id', validateBody(updateSchema), async (req: AuthedRequest, res) => {
  const tag = await findAdminTag(req.params.id, req.userId!);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });

  try {
    const updated = await prisma.tag.update({ where: { id: tag.id }, data: req.body });
    res.json(updated);
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'A tag with that name already exists in this workspace' });
    }
    throw err;
  }
});

tagsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const tag = await findAdminTag(req.params.id, req.userId!);
  if (!tag) return res.status(404).json({ error: 'Tag not found' });

  await prisma.tag.delete({ where: { id: tag.id } });
  res.status(204).send();
});
