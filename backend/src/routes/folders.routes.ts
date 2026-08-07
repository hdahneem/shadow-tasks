import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const foldersRouter = Router();
foldersRouter.use(requireAuth);

foldersRouter.get('/', async (req: AuthedRequest, res) => {
  const folders = await prisma.folder.findMany({
    where: { workspace: { members: { some: { userId: req.userId } } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(folders);
});

const createSchema = z.object({
  name: z.string().min(1).max(120),
  color: z.string().min(1).max(32),
  workspaceId: z.string().uuid(),
});

foldersRouter.post('/', validateBody(createSchema), async (req: AuthedRequest, res) => {
  const role = await getMemberRole(req.body.workspaceId, req.userId!);
  if (!role) return res.status(404).json({ error: 'Workspace not found' });
  if (!roleAtLeast(role, 'admin')) return res.status(403).json({ error: 'Admin role required' });

  const folder = await prisma.folder.create({
    data: { name: req.body.name, color: req.body.color, workspaceId: req.body.workspaceId, ownerId: req.userId! },
  });
  res.status(201).json(folder);
});

/** Resolves a folder the user is a workspace member of, or a (404, 403) response tuple if not. */
async function resolveFolderForAdmin(folderId: string, userId: string) {
  const folder = await prisma.folder.findFirst({ where: { id: folderId } });
  if (!folder) return { status: 404 as const };
  const role = await getMemberRole(folder.workspaceId, userId);
  if (!role) return { status: 404 as const };
  if (!roleAtLeast(role, 'admin')) return { status: 403 as const };
  return { status: 200 as const, folder };
}

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  color: z.string().min(1).max(32).optional(),
});

foldersRouter.patch('/:id', validateBody(updateSchema), async (req: AuthedRequest, res) => {
  const resolved = await resolveFolderForAdmin(req.params.id, req.userId!);
  if (resolved.status === 404) return res.status(404).json({ error: 'Folder not found' });
  if (resolved.status === 403) return res.status(403).json({ error: 'Admin role required' });

  const updated = await prisma.folder.update({ where: { id: resolved.folder.id }, data: req.body });
  res.json(updated);
});

foldersRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const resolved = await resolveFolderForAdmin(req.params.id, req.userId!);
  if (resolved.status === 404) return res.status(404).json({ error: 'Folder not found' });
  if (resolved.status === 403) return res.status(403).json({ error: 'Admin role required' });

  await prisma.folder.delete({ where: { id: resolved.folder.id } });
  res.status(204).send();
});
