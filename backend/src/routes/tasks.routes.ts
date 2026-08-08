import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { WorkspaceRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { logActivity } from '../services/activity.service.js';
import { buildSubtaskTree, computeTaskProgress, wouldCreateCycle } from '../services/subtask.service.js';
import { valueSchemaForField, getCustomFieldsForTask } from '../services/fieldValue.service.js';
import { getDefaultStatusId } from '../services/status.service.js';
import { snapshotChecklist } from '../services/template.service.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';
import { wouldCreateDependencyCycle, getUnresolvedPredecessors } from '../services/dependency.service.js';
import { INVERSE_RELATION_TYPE } from '../services/relation.service.js';
import { maybeSpawnOnCompletion } from '../services/recurrence.service.js';
import { getRunningEntryForUser, computeLoggedMinutes } from '../services/time.service.js';
import { notifyUsers, extractMentionedUserIds } from '../services/notification.service.js';
import { runAutomations } from '../services/automation.service.js';
import { env } from '../lib/env.js';

export const tasksRouter = Router();
tasksRouter.use(requireAuth);

async function findOwnedTask(taskId: string, userId: string, minRole: WorkspaceRole = 'member') {
  const task = await prisma.task.findFirst({
    where: { id: taskId },
    include: { list: { include: { project: true } }, status: true },
  });
  if (!task) return null;
  const role = await getMemberRole(task.list.project.workspaceId, userId, task.list.projectId);
  if (!roleAtLeast(role, minRole)) return null;
  return task;
}

async function findOwnedList(listId: string, userId: string, minRole: WorkspaceRole = 'member') {
  const list = await prisma.todoList.findFirst({ where: { id: listId }, include: { project: true } });
  if (!list) return null;
  const role = await getMemberRole(list.project.workspaceId, userId, list.projectId);
  if (!roleAtLeast(role, minRole)) return null;
  return list;
}

// --- All of the current user's tasks, across every project/list (for global views) ---

tasksRouter.get('/', async (req: AuthedRequest, res) => {
  const includeDone = req.query.includeDone === 'true';
  const archived = req.query.archived === 'true';
  // Pagination is opt-in: omitting both params keeps the original bare-array
  // response for every existing caller (loadAll, refreshTasks, CSV export, etc.).
  const paginated = req.query.page !== undefined || req.query.pageSize !== undefined;
  const rawPage = Number(req.query.page);
  const rawPageSize = Number(req.query.pageSize);
  const page = Math.max(1, Number.isFinite(rawPage) ? Math.trunc(rawPage) : 1);
  const pageSize = Math.min(Math.max(Number.isFinite(rawPageSize) ? Math.trunc(rawPageSize) : 25, 1), 100);

  const where = {
    parentTaskId: null,
    archivedAt: archived ? { not: null } : null,
    ...(includeDone || archived ? {} : { done: false }),
    list: { project: { workspace: { members: { some: { userId: req.userId } } } } },
  };
  // dueDate/archivedAt are nullable and non-unique, so ties need a deterministic
  // secondary sort or rows could be skipped/repeated when paging via skip/take.
  const orderBy = archived
    ? [{ archivedAt: 'desc' as const }, { id: 'asc' as const }]
    : [{ dueDate: 'asc' as const }, { id: 'asc' as const }];

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      orderBy,
      ...(paginated ? { skip: (page - 1) * pageSize, take: pageSize } : {}),
      include: {
        _count: { select: { subtasks: true, comments: true } },
        list: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
        assignees: { include: { user: { select: { id: true, name: true } } } },
        taskTags: { include: { tag: true } },
      },
    }),
    paginated ? prisma.task.count({ where }) : Promise.resolve(null),
  ]);

  const withProgress = await Promise.all(
    tasks.map(async (t) => ({
      ...t,
      assignees: t.assignees.map((a) => a.user),
      tags: t.taskTags.map((tt) => tt.tag),
      progress: await computeTaskProgress(t.id),
    }))
  );

  if (paginated) {
    res.json({ tasks: withProgress, total, page, pageSize });
  } else {
    res.json(withProgress);
  }
});

// --- Sync status: a cheap signature of "has anything in the visible task set
// changed" for the mobile client to compare against what it cached at its last
// clean sync, without re-downloading every task just to check. Must be registered
// before GET /:id below, or "sync-status" would be swallowed as an :id param. ---

tasksRouter.get('/sync-status', async (req: AuthedRequest, res) => {
  const includeDone = req.query.includeDone === 'true';
  const archived = req.query.archived === 'true';
  const where = {
    parentTaskId: null,
    archivedAt: archived ? { not: null } : null,
    ...(includeDone || archived ? {} : { done: false }),
    list: { project: { workspace: { members: { some: { userId: req.userId } } } } },
  };

  const agg = await prisma.task.aggregate({ where, _max: { updatedAt: true }, _count: true });

  res.json({ lastModifiedAt: agg._max.updatedAt?.toISOString() ?? null, count: agg._count });
});

// --- List tasks for a given list (top-level only) ---

tasksRouter.get('/by-list/:listId', async (req: AuthedRequest, res) => {
  const list = await findOwnedList(req.params.listId, req.userId!, 'viewer');
  if (!list) return res.status(404).json({ error: 'List not found' });

  const tasks = await prisma.task.findMany({
    where: { listId: list.id, parentTaskId: null, archivedAt: null },
    orderBy: { position: 'asc' },
    include: {
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
      progress: await computeTaskProgress(t.id),
    }))
  );

  res.json(withProgress);
});

// --- Create task (optionally as a subtask via parentTaskId) ---

const createSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().max(20000).optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.string().datetime().optional(),
  startDate: z.string().datetime().optional(),
  color: z.string().max(32).optional(),
  parentTaskId: z.string().uuid().optional(),
});

tasksRouter.post('/by-list/:listId', validateBody(createSchema), async (req: AuthedRequest, res) => {
  const list = await findOwnedList(req.params.listId, req.userId!);
  if (!list) return res.status(404).json({ error: 'List not found' });

  if (req.body.parentTaskId) {
    const parent = await findOwnedTask(req.body.parentTaskId, req.userId!);
    if (!parent) return res.status(404).json({ error: 'Parent task not found' });
  }

  const [maxPosition, defaultStatusId] = await Promise.all([
    prisma.task.aggregate({
      where: { listId: list.id, parentTaskId: req.body.parentTaskId ?? null },
      _max: { position: true },
    }),
    getDefaultStatusId(list.projectId, false),
  ]);

  const task = await prisma.task.create({
    data: {
      listId: list.id,
      parentTaskId: req.body.parentTaskId ?? null,
      title: req.body.title,
      description: req.body.description,
      priority: req.body.priority,
      statusId: defaultStatusId,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : undefined,
      startDate: req.body.startDate ? new Date(req.body.startDate) : undefined,
      color: req.body.color,
      position: (maxPosition._max.position ?? 0) + 1,
    },
  });

  await logActivity(task.id, req.userId!, 'task_created', { title: task.title });
  if (req.body.parentTaskId) {
    await logActivity(req.body.parentTaskId, req.userId!, 'subtask_added', { subtaskId: task.id, title: task.title });
  }
  await runAutomations(task.id, list.projectId, list.project.workspaceId, 'task_created', req.userId!);

  // an automation may have just changed the task (e.g. set_priority), so re-read
  // it rather than responding with the pre-automation snapshot
  const finalTask = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  res.status(201).json({ ...finalTask, progress: 0 });
});

// --- Full task detail: fields + subtask tree + comments + activity + attachments ---

const TASK_SUMMARY_SELECT = {
  id: true,
  title: true,
  done: true,
  priority: true,
} as const;

tasksRouter.get('/:id', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!, 'viewer');
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const [
    subtasks,
    comments,
    activity,
    attachments,
    progress,
    customFields,
    dependsOn,
    blocks,
    relationsFrom,
    relationsTo,
    recurrenceRule,
    assignees,
    timeEntries,
    taskTags,
  ] = await Promise.all([
    buildSubtaskTree(task.id),
    prisma.comment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { id: true, name: true } } },
    }),
    prisma.activityLogEntry.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'desc' },
      include: { actor: { select: { id: true, name: true } } },
    }),
    prisma.attachment.findMany({ where: { taskId: task.id }, orderBy: { createdAt: 'asc' } }),
    computeTaskProgress(task.id),
    getCustomFieldsForTask(task.id, task.list.projectId),
    prisma.taskDependency.findMany({
      where: { successorId: task.id },
      orderBy: { createdAt: 'asc' },
      include: { predecessor: { select: TASK_SUMMARY_SELECT } },
    }),
    prisma.taskDependency.findMany({
      where: { predecessorId: task.id },
      orderBy: { createdAt: 'asc' },
      include: { successor: { select: TASK_SUMMARY_SELECT } },
    }),
    prisma.taskRelation.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
      include: { relatedTask: { select: TASK_SUMMARY_SELECT } },
    }),
    prisma.taskRelation.findMany({
      where: { relatedTaskId: task.id },
      orderBy: { createdAt: 'asc' },
      include: { task: { select: TASK_SUMMARY_SELECT } },
    }),
    task.recurrenceRuleId ? prisma.recurrenceRule.findUnique({ where: { id: task.recurrenceRuleId } }) : null,
    prisma.taskAssignee.findMany({
      where: { taskId: task.id },
      orderBy: { assignedAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.timeEntry.findMany({
      where: { taskId: task.id },
      orderBy: { startedAt: 'desc' },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.taskTag.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
      include: { tag: true },
    }),
  ]);

  const relatedTasks = [
    ...relationsFrom.map((r) => ({ id: r.id, type: r.type, task: r.relatedTask })),
    ...relationsTo.map((r) => ({ id: r.id, type: INVERSE_RELATION_TYPE[r.type], task: r.task })),
  ];

  const { list, ...taskFields } = task;
  res.json({
    ...taskFields,
    projectId: list.projectId,
    workspaceId: list.project.workspaceId,
    subtasks,
    comments,
    activity,
    attachments,
    progress,
    customFields,
    dependsOn: dependsOn.map((edge) => ({ id: edge.id, type: edge.type, task: edge.predecessor })),
    blocks: blocks.map((edge) => ({ id: edge.id, type: edge.type, task: edge.successor })),
    relatedTasks,
    recurrence: recurrenceRule,
    assignees: assignees.map((a) => a.user),
    tags: taskTags.map((tt) => tt.tag),
    timeEntries: timeEntries.map((e) => ({
      id: e.id,
      userId: e.user.id,
      userName: e.user.name,
      startedAt: e.startedAt,
      endedAt: e.endedAt,
      note: e.note,
    })),
    loggedMinutes: computeLoggedMinutes(timeEntries),
  });
});

// --- Assignees (workspace members responsible for this task) ---

const assigneeCreateSchema = z.object({ userId: z.string().uuid() });

tasksRouter.post(
  '/:id/assignees',
  validateBody(assigneeCreateSchema),
  async (req: AuthedRequest, res) => {
    const task = await findOwnedTask(req.params.id, req.userId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const targetRole = await getMemberRole(task.list.project.workspaceId, req.body.userId);
    if (!targetRole) {
      return res.status(400).json({ error: 'That hunter is not a member of this workspace' });
    }

    try {
      const assignee = await prisma.taskAssignee.create({
        data: { taskId: task.id, userId: req.body.userId },
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      await logActivity(task.id, req.userId!, 'assignee_added', {
        userId: assignee.user.id,
        name: assignee.user.name,
      });
      await notifyUsers([assignee.user.id], {
        taskId: task.id,
        type: 'assigned',
        actorId: req.userId!,
        payload: { title: task.title },
      });
      await runAutomations(task.id, task.list.projectId, task.list.project.workspaceId, 'assignee_added', req.userId!);
      res.status(201).json(assignee.user);
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        return res.status(409).json({ error: 'That hunter is already assigned to this quest' });
      }
      throw err;
    }
  }
);

tasksRouter.delete('/:id/assignees/:userId', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const assignee = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId: task.id, userId: req.params.userId } },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!assignee) return res.status(404).json({ error: 'That hunter is not assigned to this quest' });

  await prisma.taskAssignee.delete({ where: { id: assignee.id } });
  await logActivity(task.id, req.userId!, 'assignee_removed', { userId: assignee.user.id, name: assignee.user.name });

  res.status(204).send();
});

// --- Tags (workspace-wide labels applied to this task) ---

const taskTagCreateSchema = z.object({ tagId: z.string().uuid() });

tasksRouter.post('/:id/tags', validateBody(taskTagCreateSchema), async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const tag = await prisma.tag.findFirst({
    where: { id: req.body.tagId, workspaceId: task.list.project.workspaceId },
  });
  if (!tag) return res.status(400).json({ error: 'That tag does not exist in this workspace' });

  try {
    await prisma.taskTag.create({ data: { taskId: task.id, tagId: tag.id } });
    await logActivity(task.id, req.userId!, 'tag_added', { name: tag.name });
    res.status(201).json(tag);
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return res.status(409).json({ error: 'That tag is already on this quest' });
    }
    throw err;
  }
});

tasksRouter.delete('/:id/tags/:tagId', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const taskTag = await prisma.taskTag.findUnique({
    where: { taskId_tagId: { taskId: task.id, tagId: req.params.tagId } },
    include: { tag: true },
  });
  if (!taskTag) return res.status(404).json({ error: 'That tag is not on this quest' });

  await prisma.taskTag.delete({ where: { id: taskTag.id } });
  await logActivity(task.id, req.userId!, 'tag_removed', { name: taskTag.tag.name });

  res.status(204).send();
});

// --- Time tracking (start/stop timer + manual entries) ---

tasksRouter.post('/:id/time-entries/start', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const running = await getRunningEntryForUser(req.userId!);
  if (running) {
    return res.status(409).json({
      error: 'You already have a timer running on another quest. Stop it first.',
      runningTaskId: running.taskId,
    });
  }

  const entry = await prisma.timeEntry.create({
    data: { taskId: task.id, userId: req.userId!, startedAt: new Date() },
  });
  await logActivity(task.id, req.userId!, 'time_started', {});
  res.status(201).json(entry);
});

tasksRouter.post('/:id/time-entries/stop', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const running = await prisma.timeEntry.findFirst({
    where: { taskId: task.id, userId: req.userId!, endedAt: null },
  });
  if (!running) return res.status(404).json({ error: 'You have no running timer on this quest' });

  const updated = await prisma.timeEntry.update({ where: { id: running.id }, data: { endedAt: new Date() } });
  await logActivity(task.id, req.userId!, 'time_stopped', {
    minutes: Math.round((updated.endedAt!.getTime() - updated.startedAt.getTime()) / 60000),
  });
  res.json(updated);
});

const timeEntryLogSchema = z
  .object({
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    note: z.string().max(2000).optional(),
  })
  .refine((data) => new Date(data.endedAt) > new Date(data.startedAt), {
    message: 'End time must be after start time',
    path: ['endedAt'],
  });

tasksRouter.post(
  '/:id/time-entries',
  validateBody(timeEntryLogSchema),
  async (req: AuthedRequest, res) => {
    const task = await findOwnedTask(req.params.id, req.userId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const entry = await prisma.timeEntry.create({
      data: {
        taskId: task.id,
        userId: req.userId!,
        startedAt: new Date(req.body.startedAt),
        endedAt: new Date(req.body.endedAt),
        note: req.body.note,
      },
    });
    await logActivity(task.id, req.userId!, 'time_logged', {
      minutes: Math.round((entry.endedAt!.getTime() - entry.startedAt.getTime()) / 60000),
    });
    res.status(201).json(entry);
  }
);

// --- Dependencies (this task depends on / is blocked by another task) ---

const dependencyCreateSchema = z.object({
  predecessorId: z.string().uuid(),
  type: z.enum(['finish_to_start', 'start_to_start', 'finish_to_finish']).default('finish_to_start'),
});

tasksRouter.post(
  '/:id/dependencies',
  validateBody(dependencyCreateSchema),
  async (req: AuthedRequest, res) => {
    const task = await findOwnedTask(req.params.id, req.userId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (req.body.predecessorId === task.id) {
      return res.status(400).json({ error: 'A quest cannot depend on itself' });
    }

    const predecessor = await findOwnedTask(req.body.predecessorId, req.userId!, 'viewer');
    if (!predecessor) return res.status(404).json({ error: 'Predecessor quest not found' });

    if (await wouldCreateDependencyCycle(req.body.predecessorId, task.id)) {
      return res.status(400).json({ error: 'This would create a dependency cycle' });
    }

    try {
      const dependency = await prisma.taskDependency.create({
        data: { predecessorId: req.body.predecessorId, successorId: task.id, type: req.body.type },
        include: { predecessor: { select: TASK_SUMMARY_SELECT } },
      });
      await logActivity(task.id, req.userId!, 'dependency_added', {
        predecessorId: predecessor.id,
        title: predecessor.title,
      });
      res.status(201).json({ id: dependency.id, type: dependency.type, task: dependency.predecessor });
    } catch (err) {
      if ((err as { code?: string }).code === 'P2002') {
        return res.status(409).json({ error: 'This dependency already exists' });
      }
      throw err;
    }
  }
);

// --- Relations (generic typed links to other tasks, with automatic backlinks) ---

const relationCreateSchema = z.object({
  relatedTaskId: z.string().uuid(),
  type: z
    .enum(['related', 'duplicate', 'child_project', 'parent_initiative', 'bug', 'requirement', 'documentation'])
    .default('related'),
});

tasksRouter.post(
  '/:id/relations',
  validateBody(relationCreateSchema),
  async (req: AuthedRequest, res) => {
    const task = await findOwnedTask(req.params.id, req.userId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (req.body.relatedTaskId === task.id) {
      return res.status(400).json({ error: 'A quest cannot be related to itself' });
    }

    const related = await findOwnedTask(req.body.relatedTaskId, req.userId!, 'viewer');
    if (!related) return res.status(404).json({ error: 'Related quest not found' });

    const existing = await prisma.taskRelation.findFirst({
      where: {
        OR: [
          { taskId: task.id, relatedTaskId: related.id },
          { taskId: related.id, relatedTaskId: task.id },
        ],
      },
    });
    if (existing) return res.status(409).json({ error: 'These quests are already linked' });

    const relation = await prisma.taskRelation.create({
      data: { taskId: task.id, relatedTaskId: related.id, type: req.body.type },
      include: { relatedTask: { select: TASK_SUMMARY_SELECT } },
    });
    await logActivity(task.id, req.userId!, 'relation_added', { relatedTaskId: related.id, title: related.title });

    res.status(201).json({ id: relation.id, type: relation.type, task: relation.relatedTask });
  }
);

// --- Recurrence (this task spawns a fresh occurrence on a repeating cadence) ---

const recurrenceCreateSchema = z.object({
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z.number().int().min(1).max(365).default(1),
  mode: z.enum(['after_completion', 'fixed_schedule']).default('after_completion'),
  skipWeekends: z.boolean().default(false),
  endDate: z.string().datetime().nullable().optional(),
  maxOccurrences: z.number().int().min(1).nullable().optional(),
});

tasksRouter.post(
  '/:id/recurrence',
  validateBody(recurrenceCreateSchema),
  async (req: AuthedRequest, res) => {
    const task = await findOwnedTask(req.params.id, req.userId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (task.recurrenceRuleId) {
      return res.status(409).json({ error: 'This quest already has a recurrence rule' });
    }
    if (req.body.mode === 'fixed_schedule' && !task.dueDate) {
      return res.status(400).json({ error: 'Fixed-schedule recurrence requires a due date on this quest' });
    }

    const rule = await prisma.recurrenceRule.create({
      data: {
        listId: task.listId,
        frequency: req.body.frequency,
        interval: req.body.interval,
        mode: req.body.mode,
        skipWeekends: req.body.skipWeekends,
        endDate: req.body.endDate ? new Date(req.body.endDate) : null,
        maxOccurrences: req.body.maxOccurrences ?? null,
        nextRunAt: req.body.mode === 'fixed_schedule' ? task.dueDate : null,
      },
    });
    await prisma.task.update({ where: { id: task.id }, data: { recurrenceRuleId: rule.id } });
    await logActivity(task.id, req.userId!, 'recurrence_set', {
      frequency: rule.frequency,
      interval: rule.interval,
      mode: rule.mode,
    });

    res.status(201).json(rule);
  }
);

// --- Custom field value upsert ---

const fieldValueSchema = z.object({ value: z.unknown() });

tasksRouter.patch(
  '/:id/fields/:fieldId',
  validateBody(fieldValueSchema),
  async (req: AuthedRequest, res) => {
    const task = await findOwnedTask(req.params.id, req.userId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const field = await prisma.customFieldDefinition.findFirst({
      where: { id: req.params.fieldId, projectId: task.list.projectId },
    });
    if (!field) return res.status(404).json({ error: 'Field not found on this task\'s project' });

    const schema = valueSchemaForField(field.type, field.options);
    const parsed = schema.safeParse(req.body.value);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid value for this field type', details: parsed.error.flatten() });
    }

    const saved = await prisma.customFieldValue.upsert({
      where: { fieldId_taskId: { fieldId: field.id, taskId: task.id } },
      create: { fieldId: field.id, taskId: task.id, value: parsed.data as never },
      update: { value: parsed.data as never },
    });
    res.json({ id: field.id, name: field.name, type: field.type, options: field.options, value: saved.value });
  }
);

// --- Update task fields ---

const updateSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  description: z.string().max(20000).nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  done: z.boolean().optional(),
  color: z.string().max(32).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  estimatedMinutes: z.number().int().min(0).nullable().optional(),
  actualMinutes: z.number().int().min(0).nullable().optional(),
});

tasksRouter.patch('/:id', validateBody(updateSchema), async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const body = req.body as z.infer<typeof updateSchema>;
  const data: Record<string, unknown> = { ...body };
  if ('dueDate' in body) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    data.dueSoonNotifiedAt = null;
  }
  if ('startDate' in body) data.startDate = body.startDate ? new Date(body.startDate) : null;
  if (body.done === true && !task.done) {
    const unresolved = await getUnresolvedPredecessors(task.id);
    if (unresolved.length > 0) {
      return res.status(400).json({
        error: `Blocked by ${unresolved.length} unfinished ${unresolved.length === 1 ? 'dependency' : 'dependencies'}`,
        blockedBy: unresolved,
      });
    }
  }
  if ('done' in body) {
    data.completedAt = body.done ? new Date() : null;
    // Keep the workflow status in lockstep with the quick-toggle checkbox: jump to
    // the project's default completed/not-started status so both controls agree.
    const matchingStatusId = await getDefaultStatusId(task.list.projectId, body.done!);
    if (matchingStatusId) data.statusId = matchingStatusId;
  }

  const updated = await prisma.task.update({ where: { id: task.id }, data });

  if (body.done === true && !task.done) {
    await maybeSpawnOnCompletion(task.id, req.userId!);
    await runAutomations(task.id, task.list.projectId, task.list.project.workspaceId, 'task_completed', req.userId!);
  }

  if (body.title !== undefined && body.title !== task.title) {
    await logActivity(task.id, req.userId!, 'title_changed', { from: task.title, to: body.title });
  }
  if (body.description !== undefined && body.description !== task.description) {
    await logActivity(task.id, req.userId!, 'description_changed', {});
  }
  if (body.done !== undefined && body.done !== task.done) {
    await logActivity(task.id, req.userId!, 'status_changed', { done: body.done });
  }
  if (body.priority !== undefined && body.priority !== task.priority) {
    await logActivity(task.id, req.userId!, 'priority_changed', { from: task.priority, to: body.priority });
  }
  if ('dueDate' in body) {
    await logActivity(task.id, req.userId!, 'due_date_changed', { to: body.dueDate ?? null });
  }
  if ('startDate' in body) {
    await logActivity(task.id, req.userId!, 'start_date_changed', { to: body.startDate ?? null });
  }
  if (body.color !== undefined && body.color !== task.color) {
    await logActivity(task.id, req.userId!, 'color_changed', { to: body.color ?? null });
  }
  if (body.coverImageUrl !== undefined && body.coverImageUrl !== task.coverImageUrl) {
    await logActivity(task.id, req.userId!, 'cover_image_changed', {});
  }

  // re-read in case an automation just changed the row (e.g. task_completed -> set_status)
  const finalTask = await prisma.task.findUniqueOrThrow({ where: { id: updated.id } });
  const progress = await computeTaskProgress(finalTask.id);
  res.json({ ...finalTask, progress });
});

// --- Move to a different workflow status (board drag & drop) ---

const statusMoveSchema = z.object({ statusId: z.string().uuid() });

tasksRouter.patch('/:id/status', validateBody(statusMoveSchema), async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const targetStatus = await prisma.status.findFirst({
    where: { id: req.body.statusId, projectId: task.list.projectId },
  });
  if (!targetStatus) return res.status(404).json({ error: 'Status not found on this project' });

  if (targetStatus.isCompleted && !task.done) {
    const unresolved = await getUnresolvedPredecessors(task.id);
    if (unresolved.length > 0) {
      return res.status(400).json({
        error: `Blocked by ${unresolved.length} unfinished ${unresolved.length === 1 ? 'dependency' : 'dependencies'}`,
        blockedBy: unresolved,
      });
    }
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      statusId: targetStatus.id,
      done: targetStatus.isCompleted,
      completedAt: targetStatus.isCompleted ? new Date() : null,
    },
    include: { status: true },
  });

  await logActivity(task.id, req.userId!, 'status_moved', {
    from: task.status?.name ?? null,
    to: targetStatus.name,
  });

  if (targetStatus.isCompleted && !task.done) {
    await maybeSpawnOnCompletion(task.id, req.userId!);
  }

  await runAutomations(task.id, task.list.projectId, task.list.project.workspaceId, 'status_changed_to', req.userId!, {
    statusId: targetStatus.id,
  });
  if (targetStatus.isCompleted && !task.done) {
    await runAutomations(task.id, task.list.projectId, task.list.project.workspaceId, 'task_completed', req.userId!);
  }

  // re-read in case an automation just changed the row again (e.g. a second automation
  // reassigning status/priority on top of this move)
  const finalTask = await prisma.task.findUniqueOrThrow({ where: { id: updated.id }, include: { status: true } });
  const progress = await computeTaskProgress(finalTask.id);
  res.json({ ...finalTask, progress });
});

// --- Delete ---

tasksRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  await prisma.task.delete({ where: { id: task.id } });
  res.status(204).send();
});

// --- Archive / restore ---

tasksRouter.post('/:id/archive', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const updated = await prisma.task.update({ where: { id: task.id }, data: { archivedAt: new Date() } });
  await logActivity(task.id, req.userId!, 'archived', {});
  res.json(updated);
});

tasksRouter.post('/:id/restore', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const updated = await prisma.task.update({ where: { id: task.id }, data: { archivedAt: null } });
  await logActivity(task.id, req.userId!, 'restored', {});
  res.json(updated);
});

// --- Public sharing (read-only, unauthenticated link) ---

tasksRouter.post('/:id/share', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const shareToken = task.shareToken ?? crypto.randomBytes(24).toString('hex');
  if (!task.shareToken) {
    await prisma.task.update({ where: { id: task.id }, data: { shareToken } });
    await logActivity(task.id, req.userId!, 'share_enabled', {});
  }
  res.json({ shareToken });
});

tasksRouter.delete('/:id/share', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  await prisma.task.update({ where: { id: task.id }, data: { shareToken: null } });
  await logActivity(task.id, req.userId!, 'share_revoked', {});
  res.status(204).send();
});

// --- Move to a different list ---

const moveSchema = z.object({ listId: z.string().uuid() });

tasksRouter.post('/:id/move', validateBody(moveSchema), async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const targetList = await findOwnedList(req.body.listId, req.userId!);
  if (!targetList) return res.status(404).json({ error: 'Target list not found' });

  const updated = await prisma.task.update({ where: { id: task.id }, data: { listId: targetList.id } });
  await logActivity(task.id, req.userId!, 'moved', { fromListId: task.listId, toListId: targetList.id });
  res.json(updated);
});

// --- Duplicate (deep copy including subtasks, fresh history) ---

tasksRouter.post('/:id/duplicate', async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  async function cloneTask(sourceId: string, listId: string, parentTaskId: string | null): Promise<string> {
    const source = await prisma.task.findUniqueOrThrow({ where: { id: sourceId } });
    const clone = await prisma.task.create({
      data: {
        listId,
        parentTaskId,
        title: parentTaskId ? source.title : `${source.title} (copy)`,
        description: source.description,
        priority: source.priority,
        statusId: source.statusId,
        done: source.done,
        color: source.color,
        coverImageUrl: source.coverImageUrl,
        dueDate: source.dueDate,
        startDate: source.startDate,
        estimatedMinutes: source.estimatedMinutes,
        position: source.position,
      },
    });

    const sourceValues = await prisma.customFieldValue.findMany({ where: { taskId: sourceId } });
    if (sourceValues.length > 0) {
      await prisma.customFieldValue.createMany({
        data: sourceValues.map((v) => ({ fieldId: v.fieldId, taskId: clone.id, value: v.value as never })),
      });
    }

    const children = await prisma.task.findMany({ where: { parentTaskId: sourceId } });
    for (const child of children) {
      await cloneTask(child.id, listId, clone.id);
    }
    return clone.id;
  }

  const newId = await cloneTask(task.id, task.listId, null);
  await logActivity(newId, req.userId!, 'duplicated', { fromTaskId: task.id });
  const created = await prisma.task.findUnique({ where: { id: newId } });
  res.status(201).json({ ...created, progress: 0 });
});

// --- Save this task's title/description/priority and subtask checklist as a reusable template ---

const saveTaskAsTemplateSchema = z.object({ name: z.string().min(1).max(160) });

tasksRouter.post(
  '/:id/save-as-template',
  validateBody(saveTaskAsTemplateSchema),
  async (req: AuthedRequest, res) => {
    const task = await findOwnedTask(req.params.id, req.userId!);
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const subtasks = await snapshotChecklist(task.id);

    const template = await prisma.taskTemplate.create({
      data: {
        userId: req.userId!,
        name: req.body.name,
        title: task.title,
        description: task.description,
        priority: task.priority,
        subtasks: subtasks as never,
      },
    });
    res.status(201).json(template);
  }
);

// --- Reorder / reparent (drag & drop) ---

const reorderSchema = z.object({
  parentTaskId: z.string().uuid().nullable().optional(),
  position: z.number(),
});

tasksRouter.patch('/:id/reorder', validateBody(reorderSchema), async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const body = req.body as z.infer<typeof reorderSchema>;

  if (body.parentTaskId !== undefined && body.parentTaskId !== null) {
    const parent = await findOwnedTask(body.parentTaskId, req.userId!);
    if (!parent) return res.status(404).json({ error: 'Target parent task not found' });
    if (await wouldCreateCycle(task.id, body.parentTaskId)) {
      return res.status(400).json({ error: 'Cannot move a task under its own subtask' });
    }
  }

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      position: body.position,
      ...(body.parentTaskId !== undefined ? { parentTaskId: body.parentTaskId } : {}),
    },
  });
  res.json(updated);
});

// --- Comments ---

const commentSchema = z.object({
  body: z.string().min(1).max(10000),
  parentCommentId: z.string().uuid().optional(),
});

tasksRouter.post('/:id/comments', validateBody(commentSchema), async (req: AuthedRequest, res) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  let parent: Awaited<ReturnType<typeof prisma.comment.findFirst>> = null;
  if (req.body.parentCommentId) {
    parent = await prisma.comment.findFirst({ where: { id: req.body.parentCommentId, taskId: task.id } });
    if (!parent) return res.status(404).json({ error: 'Comment being replied to was not found on this task' });
    if (parent.parentCommentId) {
      return res.status(400).json({ error: 'Cannot reply to a reply — only top-level comments can be replied to' });
    }
  }

  const comment = await prisma.comment.create({
    data: {
      taskId: task.id,
      authorId: req.userId!,
      body: req.body.body,
      parentCommentId: parent?.id ?? null,
    },
    include: { author: { select: { id: true, name: true } } },
  });
  await logActivity(task.id, req.userId!, 'comment_added', { commentId: comment.id });

  const [members, assignees] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: task.list.project.workspaceId },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.taskAssignee.findMany({ where: { taskId: task.id } }),
  ]);
  const mentionedIds = extractMentionedUserIds(
    req.body.body,
    members.map((m) => ({ userId: m.user.id, firstName: m.user.name.split(' ')[0] }))
  );
  await notifyUsers(mentionedIds, {
    taskId: task.id,
    type: 'mentioned',
    actorId: req.userId!,
    payload: { title: task.title },
  });
  const notifyIds = new Set(assignees.map((a) => a.userId).filter((id) => !mentionedIds.includes(id)));
  if (parent && parent.authorId !== req.userId! && !mentionedIds.includes(parent.authorId)) {
    notifyIds.add(parent.authorId);
  }
  await notifyUsers([...notifyIds], {
    taskId: task.id,
    type: 'comment_added',
    actorId: req.userId!,
    payload: { title: task.title },
  });

  res.status(201).json(comment);
});

// --- Attachments (local disk storage) ---

fs.mkdirSync(env.uploadsDir, { recursive: true });

// Deliberately excludes SVG (`image/svg+xml` can embed <script>, a stored-XSS
// vector when the "image" is later rendered) and any executable/script type.
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: env.uploadsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error(`File type "${file.mimetype}" is not allowed.`));
  },
});

function handleUploadError(err: unknown, _req: Request, res: Response, next: NextFunction) {
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 25MB).' : err.message;
    return res.status(400).json({ error: message });
  }
  if (err instanceof Error) return res.status(400).json({ error: err.message });
  next(err);
}

tasksRouter.post('/:id/attachments', upload.single('file'), handleUploadError, async (req: AuthedRequest, res: Response) => {
  const task = await findOwnedTask(req.params.id, req.userId!);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const attachment = await prisma.attachment.create({
    data: {
      taskId: task.id,
      filename: req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      mimeType: req.file.mimetype,
      size: req.file.size,
    },
  });
  await logActivity(task.id, req.userId!, 'attachment_added', { filename: attachment.filename });
  res.status(201).json(attachment);
});
