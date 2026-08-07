import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { createSubtasksFromChecklist, type ChecklistNode } from '../services/template.service.js';
import { getDefaultStatusId } from '../services/status.service.js';
import { logActivity } from '../services/activity.service.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const projectTemplatesRouter = Router();
projectTemplatesRouter.use(requireAuth);

export const taskTemplatesRouter = Router();
taskTemplatesRouter.use(requireAuth);

// --- Project templates ---

projectTemplatesRouter.get('/', async (req: AuthedRequest, res) => {
  const templates = await prisma.projectTemplate.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(templates);
});

projectTemplatesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const template = await prisma.projectTemplate.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!template) return res.status(404).json({ error: 'Template not found' });

  await prisma.projectTemplate.delete({ where: { id: template.id } });
  res.status(204).send();
});

const createProjectFromTemplateSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  rank: z.enum(['E', 'D', 'C', 'B', 'A', 'S']).default('E'),
  folderId: z.string().uuid().nullable().optional(),
  workspaceId: z.string().uuid(),
});

projectTemplatesRouter.post(
  '/:id/create-project',
  validateBody(createProjectFromTemplateSchema),
  async (req: AuthedRequest, res) => {
    const template = await prisma.projectTemplate.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const role = await getMemberRole(req.body.workspaceId, req.userId!);
    if (!role) return res.status(404).json({ error: 'Workspace not found' });
    if (!roleAtLeast(role, 'admin')) return res.status(403).json({ error: 'Admin role required' });

    if (req.body.folderId) {
      const folder = await prisma.folder.findFirst({
        where: { id: req.body.folderId, workspaceId: req.body.workspaceId },
      });
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
    }

    const project = await prisma.project.create({
      data: { ...req.body, ownerId: req.userId! },
    });

    const statuses = template.statuses as { name: string; color: string; isCompleted: boolean; position: number }[];
    const fields = template.fields as { name: string; type: string; options: string[] | null; position: number }[];
    const listNames = template.listNames as string[];

    await Promise.all([
      ...statuses.map((s) =>
        prisma.status.create({
          data: { projectId: project.id, name: s.name, color: s.color, isCompleted: s.isCompleted, position: s.position },
        })
      ),
      ...fields.map((f) =>
        prisma.customFieldDefinition.create({
          data: {
            projectId: project.id,
            name: f.name,
            type: f.type as never,
            options: f.options ?? undefined,
            position: f.position,
          },
        })
      ),
      ...listNames.map((name) => prisma.todoList.create({ data: { projectId: project.id, name } })),
    ]);

    res.status(201).json({ ...project, effectiveRole: role });
  }
);

// --- Task templates ---

taskTemplatesRouter.get('/', async (req: AuthedRequest, res) => {
  const templates = await prisma.taskTemplate.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json(templates);
});

taskTemplatesRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const template = await prisma.taskTemplate.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!template) return res.status(404).json({ error: 'Template not found' });

  await prisma.taskTemplate.delete({ where: { id: template.id } });
  res.status(204).send();
});

const createTaskFromTemplateSchema = z.object({ listId: z.string().uuid() });

taskTemplatesRouter.post(
  '/:id/create-task',
  validateBody(createTaskFromTemplateSchema),
  async (req: AuthedRequest, res) => {
    const template = await prisma.taskTemplate.findFirst({
      where: { id: req.params.id, userId: req.userId },
    });
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const list = await prisma.todoList.findFirst({ where: { id: req.body.listId }, include: { project: true } });
    const listRole = list ? await getMemberRole(list.project.workspaceId, req.userId!, list.projectId) : null;
    if (!list || !roleAtLeast(listRole, 'member')) return res.status(404).json({ error: 'List not found' });

    const [maxPosition, defaultStatusId] = await Promise.all([
      prisma.task.aggregate({ where: { listId: list.id, parentTaskId: null }, _max: { position: true } }),
      getDefaultStatusId(list.projectId, false),
    ]);

    const task = await prisma.task.create({
      data: {
        listId: list.id,
        title: template.title,
        description: template.description,
        priority: template.priority,
        statusId: defaultStatusId,
        position: (maxPosition._max.position ?? 0) + 1,
      },
    });
    await logActivity(task.id, req.userId!, 'task_created', { title: task.title, fromTemplate: template.name });

    const checklist = template.subtasks as unknown as ChecklistNode[];
    if (checklist.length > 0) {
      await createSubtasksFromChecklist(list.id, task.id, list.projectId, checklist);
    }

    res.status(201).json({ ...task, progress: 0 });
  }
);
