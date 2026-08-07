import { Router } from 'express';
import { z } from 'zod';
import type { WorkspaceRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { FIELD_TYPES, getCustomFieldsForTask } from '../services/fieldValue.service.js';
import { createDefaultStatuses } from '../services/status.service.js';
import { computeTaskProgress } from '../services/subtask.service.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);

/** Resolves a project the user belongs to (via its workspace) at or above the required role. */
async function resolveProject(projectId: string, userId: string, minRole: WorkspaceRole) {
  const project = await prisma.project.findFirst({ where: { id: projectId } });
  if (!project) return { status: 404 as const };
  const role = await getMemberRole(project.workspaceId, userId, project.id);
  if (!role) return { status: 404 as const };
  if (!roleAtLeast(role, minRole)) return { status: 403 as const };
  return { status: 200 as const, project, role };
}

function respondUnresolved(res: import('express').Response, resolved: { status: 403 | 404 }) {
  if (resolved.status === 404) return res.status(404).json({ error: 'Project not found' });
  return res.status(403).json({ error: 'You do not have permission to do this' });
}

projectsRouter.get('/', async (req: AuthedRequest, res) => {
  const projects = await prisma.project.findMany({
    where: { workspace: { members: { some: { userId: req.userId } } } },
    orderBy: { createdAt: 'asc' },
  });
  const withEffectiveRole = await Promise.all(
    projects.map(async (p) => ({
      ...p,
      effectiveRole: await getMemberRole(p.workspaceId, req.userId!, p.id),
    }))
  );
  res.json(withEffectiveRole);
});

const createSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(2000).optional(),
  rank: z.enum(['E', 'D', 'C', 'B', 'A', 'S']).default('E'),
  folderId: z.string().uuid().nullable().optional(),
  workspaceId: z.string().uuid(),
});

projectsRouter.post('/', validateBody(createSchema), async (req: AuthedRequest, res) => {
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
  await createDefaultStatuses(project.id);
  res.status(201).json({ ...project, effectiveRole: role });
});

const updateSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  description: z.string().max(2000).nullable().optional(),
  rank: z.enum(['E', 'D', 'C', 'B', 'A', 'S']).optional(),
  folderId: z.string().uuid().nullable().optional(),
});

projectsRouter.patch('/:id', validateBody(updateSchema), async (req: AuthedRequest, res) => {
  const resolved = await resolveProject(req.params.id, req.userId!, 'admin');
  if (resolved.status !== 200) return respondUnresolved(res, resolved);

  const updated = await prisma.project.update({ where: { id: resolved.project.id }, data: req.body });
  res.json({ ...updated, effectiveRole: resolved.role });
});

projectsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const resolved = await resolveProject(req.params.id, req.userId!, 'admin');
  if (resolved.status !== 200) return respondUnresolved(res, resolved);

  await prisma.project.delete({ where: { id: resolved.project.id } });
  res.status(204).send();
});

// --- Lists nested under a project ---

const listCreateSchema = z.object({ name: z.string().min(1).max(120) });

projectsRouter.get('/:projectId/lists', async (req: AuthedRequest, res) => {
  const resolved = await resolveProject(req.params.projectId, req.userId!, 'viewer');
  if (resolved.status !== 200) return respondUnresolved(res, resolved);

  const lists = await prisma.todoList.findMany({
    where: { projectId: resolved.project.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(lists);
});

projectsRouter.post(
  '/:projectId/lists',
  validateBody(listCreateSchema),
  async (req: AuthedRequest, res) => {
    const resolved = await resolveProject(req.params.projectId, req.userId!, 'member');
    if (resolved.status !== 200) return respondUnresolved(res, resolved);

    const list = await prisma.todoList.create({
      data: { name: req.body.name, projectId: resolved.project.id },
    });
    res.status(201).json(list);
  }
);

// --- Custom field definitions nested under a project ---

const fieldCreateSchema = z
  .object({
    name: z.string().min(1).max(80),
    type: z.enum(FIELD_TYPES as [string, ...string[]]),
    options: z.array(z.string().min(1).max(80)).max(50).optional(),
  })
  .refine((body) => (body.type === 'dropdown' || body.type === 'multi_select' ? !!body.options?.length : true), {
    message: 'Dropdown and multi-select fields need at least one option',
    path: ['options'],
  });

projectsRouter.get('/:projectId/fields', async (req: AuthedRequest, res) => {
  const resolved = await resolveProject(req.params.projectId, req.userId!, 'viewer');
  if (resolved.status !== 200) return respondUnresolved(res, resolved);

  const fields = await prisma.customFieldDefinition.findMany({
    where: { projectId: resolved.project.id },
    orderBy: { position: 'asc' },
  });
  res.json(fields);
});

projectsRouter.post(
  '/:projectId/fields',
  validateBody(fieldCreateSchema),
  async (req: AuthedRequest, res) => {
    const resolved = await resolveProject(req.params.projectId, req.userId!, 'admin');
    if (resolved.status !== 200) return respondUnresolved(res, resolved);

    const maxPosition = await prisma.customFieldDefinition.aggregate({
      where: { projectId: resolved.project.id },
      _max: { position: true },
    });

    const field = await prisma.customFieldDefinition.create({
      data: {
        projectId: resolved.project.id,
        name: req.body.name,
        type: req.body.type,
        options: req.body.options ?? undefined,
        position: (maxPosition._max.position ?? 0) + 1,
      },
    });
    res.status(201).json(field);
  }
);

// --- Statuses (workflow columns) nested under a project ---

const statusCreateSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().min(1).max(32).default('#22d3ee'),
  isCompleted: z.boolean().default(false),
});

projectsRouter.get('/:projectId/statuses', async (req: AuthedRequest, res) => {
  const resolved = await resolveProject(req.params.projectId, req.userId!, 'viewer');
  if (resolved.status !== 200) return respondUnresolved(res, resolved);

  const statuses = await prisma.status.findMany({
    where: { projectId: resolved.project.id },
    orderBy: { position: 'asc' },
  });
  res.json(statuses);
});

projectsRouter.post(
  '/:projectId/statuses',
  validateBody(statusCreateSchema),
  async (req: AuthedRequest, res) => {
    const resolved = await resolveProject(req.params.projectId, req.userId!, 'admin');
    if (resolved.status !== 200) return respondUnresolved(res, resolved);

    const maxPosition = await prisma.status.aggregate({
      where: { projectId: resolved.project.id },
      _max: { position: true },
    });

    const status = await prisma.status.create({
      data: {
        projectId: resolved.project.id,
        name: req.body.name,
        color: req.body.color,
        isCompleted: req.body.isCompleted,
        position: (maxPosition._max.position ?? 0) + 1,
      },
    });
    res.status(201).json(status);
  }
);

// --- Automations (trigger + action rules) ---

const automationCreateSchema = z.object({
  name: z.string().min(1).max(120),
  triggerType: z.enum(['task_created', 'status_changed_to', 'task_completed', 'assignee_added']),
  triggerConfig: z.record(z.string(), z.unknown()).default({}),
  actionType: z.enum(['set_status', 'set_priority', 'assign_user', 'add_comment', 'add_tag']),
  actionConfig: z.record(z.string(), z.unknown()).default({}),
});

projectsRouter.get('/:projectId/automations', async (req: AuthedRequest, res) => {
  const resolved = await resolveProject(req.params.projectId, req.userId!, 'admin');
  if (resolved.status !== 200) return respondUnresolved(res, resolved);

  const automations = await prisma.automation.findMany({
    where: { projectId: resolved.project.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(automations);
});

projectsRouter.post(
  '/:projectId/automations',
  validateBody(automationCreateSchema),
  async (req: AuthedRequest, res) => {
    const resolved = await resolveProject(req.params.projectId, req.userId!, 'admin');
    if (resolved.status !== 200) return respondUnresolved(res, resolved);

    const automation = await prisma.automation.create({
      data: {
        projectId: resolved.project.id,
        name: req.body.name,
        triggerType: req.body.triggerType,
        triggerConfig: req.body.triggerConfig as never,
        actionType: req.body.actionType,
        actionConfig: req.body.actionConfig as never,
      },
    });
    res.status(201).json(automation);
  }
);

// --- Save this project's statuses, custom fields, and list names as a reusable template ---

const saveAsTemplateSchema = z.object({ name: z.string().min(1).max(160) });

projectsRouter.post(
  '/:id/save-as-template',
  validateBody(saveAsTemplateSchema),
  async (req: AuthedRequest, res) => {
    const resolved = await resolveProject(req.params.id, req.userId!, 'member');
    if (resolved.status !== 200) return respondUnresolved(res, resolved);
    const project = resolved.project;

    const [statuses, fields, lists] = await Promise.all([
      prisma.status.findMany({ where: { projectId: project.id }, orderBy: { position: 'asc' } }),
      prisma.customFieldDefinition.findMany({ where: { projectId: project.id }, orderBy: { position: 'asc' } }),
      prisma.todoList.findMany({ where: { projectId: project.id }, orderBy: { createdAt: 'asc' } }),
    ]);

    const template = await prisma.projectTemplate.create({
      data: {
        userId: req.userId!,
        name: req.body.name,
        statuses: statuses.map((s) => ({
          name: s.name,
          color: s.color,
          isCompleted: s.isCompleted,
          position: s.position,
        })) as never,
        fields: fields.map((f) => ({
          name: f.name,
          type: f.type,
          options: f.options,
          position: f.position,
        })) as never,
        listNames: lists.map((l) => l.name) as never,
      },
    });
    res.status(201).json(template);
  }
);

// --- All top-level tasks across every list in a project (for the board view) ---

projectsRouter.get('/:projectId/tasks', async (req: AuthedRequest, res) => {
  const resolved = await resolveProject(req.params.projectId, req.userId!, 'viewer');
  if (resolved.status !== 200) return respondUnresolved(res, resolved);

  const tasks = await prisma.task.findMany({
    where: { list: { projectId: resolved.project.id }, parentTaskId: null, archivedAt: null },
    orderBy: { position: 'asc' },
    include: {
      status: true,
      list: { select: { id: true, name: true } },
      _count: { select: { subtasks: true, comments: true } },
      assignees: { include: { user: { select: { id: true, name: true } } } },
      taskTags: { include: { tag: true } },
    },
  });

  const withProgress = await Promise.all(
    tasks.map(async (t) => ({
      ...t,
      assignees: t.assignees.map((a) => a.user),
      tags: t.taskTags.map((tt) => tt.tag),
      customFields: await getCustomFieldsForTask(t.id, resolved.project.id),
      progress: await computeTaskProgress(t.id),
    }))
  );

  res.json(withProgress);
});

// --- Project-level access overrides (layered on top of workspace roles) ---

const OVERRIDABLE_ROLES = ['viewer', 'member', 'admin'] as const;

projectsRouter.get('/:projectId/members', async (req: AuthedRequest, res) => {
  const resolved = await resolveProject(req.params.projectId, req.userId!, 'admin');
  if (resolved.status !== 200) return respondUnresolved(res, resolved);

  const [workspaceMembers, overrides] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: resolved.project.workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.projectMember.findMany({ where: { projectId: resolved.project.id } }),
  ]);
  const overrideByUserId = new Map(overrides.map((o) => [o.userId, o.role]));

  res.json(
    workspaceMembers.map((m) => {
      const overrideRole = overrideByUserId.get(m.userId) ?? null;
      return {
        userId: m.userId,
        user: m.user,
        workspaceRole: m.role,
        overrideRole,
        effectiveRole: overrideRole ?? m.role,
      };
    })
  );
});

const setMemberRoleSchema = z.object({ role: z.enum(OVERRIDABLE_ROLES) });

projectsRouter.put(
  '/:projectId/members/:userId',
  validateBody(setMemberRoleSchema),
  async (req: AuthedRequest, res) => {
    const resolved = await resolveProject(req.params.projectId, req.userId!, 'admin');
    if (resolved.status !== 200) return respondUnresolved(res, resolved);

    const targetMembership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: resolved.project.workspaceId, userId: req.params.userId } },
    });
    if (!targetMembership) {
      return res.status(400).json({ error: 'That hunter is not a member of this workspace' });
    }

    const override = await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: resolved.project.id, userId: req.params.userId } },
      create: { projectId: resolved.project.id, userId: req.params.userId, role: req.body.role },
      update: { role: req.body.role },
    });
    res.json({ userId: override.userId, overrideRole: override.role, effectiveRole: override.role });
  }
);

projectsRouter.delete('/:projectId/members/:userId', async (req: AuthedRequest, res) => {
  const resolved = await resolveProject(req.params.projectId, req.userId!, 'admin');
  if (resolved.status !== 200) return respondUnresolved(res, resolved);

  try {
    await prisma.projectMember.delete({
      where: { projectId_userId: { projectId: resolved.project.id, userId: req.params.userId } },
    });
  } catch (err) {
    // no override existed to remove — already at the inherited workspace role, not an error
    if ((err as { code?: string }).code !== 'P2025') throw err;
  }

  res.status(204).send();
});
