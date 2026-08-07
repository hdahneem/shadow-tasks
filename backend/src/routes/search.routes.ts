import { Router } from 'express';
import { z } from 'zod';
import type { FieldType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const searchRouter = Router();
searchRouter.use(requireAuth);

const RESULT_LIMIT = 50;

// Only field types whose stored value is a plain JSON string are worth a text
// search — numbers/booleans/dates/multi_select don't have meaningful "contains"
// semantics for a free-text query.
const TEXT_SEARCHABLE_FIELD_TYPES: FieldType[] = ['text', 'email', 'phone', 'url', 'dropdown'];

searchRouter.get('/', async (req: AuthedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
  const priority = typeof req.query.priority === 'string' ? req.query.priority : undefined;
  const done = typeof req.query.done === 'string' ? req.query.done === 'true' : undefined;
  const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : undefined;
  const dueFrom = typeof req.query.dueFrom === 'string' ? req.query.dueFrom : undefined;
  const dueTo = typeof req.query.dueTo === 'string' ? req.query.dueTo : undefined;

  const taskVisibility = {
    list: {
      project: {
        workspace: { members: { some: { userId: req.userId } } },
        ...(projectId ? { id: projectId } : {}),
      },
    },
  };

  // Postgres can't apply Prisma's `mode: 'insensitive'` JSON filter to a jsonb
  // column (`lower(jsonb)` doesn't exist), so fetch the text-typed candidates and
  // match case-insensitively in JS instead of pushing the substring check to SQL.
  const customFieldTaskIds = q
    ? await (async () => {
        const needle = q.toLowerCase();
        const candidates = await prisma.customFieldValue.findMany({
          where: {
            field: { type: { in: TEXT_SEARCHABLE_FIELD_TYPES } },
            task: { archivedAt: null, parentTaskId: null, ...taskVisibility },
          },
          select: { taskId: true, value: true },
        });
        const matched = candidates.filter(
          (c) => typeof c.value === 'string' && c.value.toLowerCase().includes(needle)
        );
        return [...new Set(matched.map((c) => c.taskId))];
      })()
    : [];

  const taskWhere: Record<string, unknown> = {
    archivedAt: null,
    parentTaskId: null,
    ...taskVisibility,
  };
  if (q) {
    taskWhere.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      ...(customFieldTaskIds.length > 0 ? [{ id: { in: customFieldTaskIds } }] : []),
    ];
  }
  if (priority) taskWhere.priority = priority;
  if (done !== undefined) taskWhere.done = done;
  if (dueFrom || dueTo) {
    taskWhere.dueDate = {
      ...(dueFrom ? { gte: new Date(dueFrom) } : {}),
      ...(dueTo ? { lte: new Date(dueTo) } : {}),
    };
  }

  const tasks = await prisma.task.findMany({
    where: taskWhere,
    take: RESULT_LIMIT,
    orderBy: { updatedAt: 'desc' },
    include: {
      list: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
    },
  });

  const comments = q
    ? await prisma.comment.findMany({
        where: {
          body: { contains: q, mode: 'insensitive' },
          task: { archivedAt: null, ...taskVisibility },
        },
        take: RESULT_LIMIT,
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { id: true, name: true } },
          task: {
            select: {
              id: true,
              title: true,
              list: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
            },
          },
        },
      })
    : [];

  // Docs are workspace-scoped, not project-scoped, so a projectId filter (which
  // narrows everything else to one project) has no sensible meaning for them —
  // skip docs entirely rather than guess at an association that doesn't exist.
  const docs =
    q && !projectId
      ? await prisma.doc.findMany({
          where: {
            workspace: { members: { some: { userId: req.userId } } },
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { content: { contains: q, mode: 'insensitive' } },
            ],
          },
          take: RESULT_LIMIT,
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            title: true,
            content: true,
            updatedAt: true,
            workspace: { select: { id: true, name: true } },
          },
        })
      : [];

  res.json({ tasks, comments, docs });
});

const savedSearchCreateSchema = z.object({
  name: z.string().min(1).max(80),
  query: z.string().max(200).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export const savedSearchesRouter = Router();
savedSearchesRouter.use(requireAuth);

savedSearchesRouter.get('/', async (req: AuthedRequest, res) => {
  const searches = await prisma.savedSearch.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(searches);
});

savedSearchesRouter.post('/', validateBody(savedSearchCreateSchema), async (req: AuthedRequest, res) => {
  const saved = await prisma.savedSearch.create({
    data: {
      userId: req.userId!,
      name: req.body.name,
      query: req.body.query,
      filters: req.body.filters ?? undefined,
    },
  });
  res.status(201).json(saved);
});

savedSearchesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const existing = await prisma.savedSearch.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) return res.status(404).json({ error: 'Saved search not found' });

  await prisma.savedSearch.delete({ where: { id: existing.id } });
  res.status(204).send();
});
