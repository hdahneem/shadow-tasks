import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const docsRouter = Router();
docsRouter.use(requireAuth);

const DOC_SUMMARY_SELECT = {
  id: true,
  workspaceId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} as const;

function toSummary(doc: { author: { id: string; name: string } } & Record<string, unknown>) {
  const { author, ...rest } = doc;
  return { ...rest, authorName: author.name };
}

async function findOwnedDoc(docId: string, userId: string, minRole: 'viewer' | 'member' = 'viewer') {
  const doc = await prisma.doc.findFirst({ where: { id: docId } });
  if (!doc) return null;
  const role = await getMemberRole(doc.workspaceId, userId);
  if (!roleAtLeast(role, minRole)) return null;
  return doc;
}

docsRouter.get('/', async (req: AuthedRequest, res) => {
  const workspaceId = req.query.workspaceId as string | undefined;
  if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });

  const role = await getMemberRole(workspaceId, req.userId!);
  if (!roleAtLeast(role, 'viewer')) return res.status(404).json({ error: 'Workspace not found' });

  const docs = await prisma.doc.findMany({
    where: { workspaceId },
    orderBy: { updatedAt: 'desc' },
    select: DOC_SUMMARY_SELECT,
  });
  res.json(docs.map(toSummary));
});

const createSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(200),
});

docsRouter.post('/', validateBody(createSchema), async (req: AuthedRequest, res) => {
  const role = await getMemberRole(req.body.workspaceId, req.userId!);
  if (!roleAtLeast(role, 'member')) return res.status(404).json({ error: 'Workspace not found' });

  const doc = await prisma.doc.create({
    data: { workspaceId: req.body.workspaceId, title: req.body.title, authorId: req.userId! },
    select: DOC_SUMMARY_SELECT,
  });
  res.status(201).json({ ...toSummary(doc), content: '' });
});

docsRouter.get('/:id', async (req: AuthedRequest, res) => {
  const doc = await prisma.doc.findFirst({
    where: { id: req.params.id },
    include: { author: { select: { id: true, name: true } } },
  });
  if (!doc) return res.status(404).json({ error: 'Doc not found' });
  const role = await getMemberRole(doc.workspaceId, req.userId!);
  if (!roleAtLeast(role, 'viewer')) return res.status(404).json({ error: 'Doc not found' });

  res.json(toSummary(doc));
});

const updateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().max(200000).optional(),
});

docsRouter.patch('/:id', validateBody(updateSchema), async (req: AuthedRequest, res) => {
  const doc = await findOwnedDoc(req.params.id, req.userId!, 'member');
  if (!doc) return res.status(404).json({ error: 'Doc not found' });

  const updated = await prisma.doc.update({
    where: { id: doc.id },
    data: req.body,
    include: { author: { select: { id: true, name: true } } },
  });
  res.json(toSummary(updated));
});

docsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const doc = await findOwnedDoc(req.params.id, req.userId!, 'member');
  if (!doc) return res.status(404).json({ error: 'Doc not found' });

  await prisma.doc.delete({ where: { id: doc.id } });
  res.status(204).send();
});
