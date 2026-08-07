import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getMemberRole, hasWorkspaceRole, countOwners, roleAtLeast } from '../services/workspace.service.js';

export const workspacesRouter = Router();
workspacesRouter.use(requireAuth);

const ROLES = ['viewer', 'member', 'admin', 'owner'] as const;

workspacesRouter.get('/', async (req: AuthedRequest, res) => {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: req.userId },
    include: { workspace: true },
    orderBy: { createdAt: 'asc' },
  });
  res.json(
    memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      ownerId: m.workspace.ownerId,
      role: m.role,
      createdAt: m.workspace.createdAt,
    }))
  );
});

const createSchema = z.object({ name: z.string().min(1).max(160) });

workspacesRouter.post('/', validateBody(createSchema), async (req: AuthedRequest, res) => {
  const workspace = await prisma.workspace.create({
    data: {
      name: req.body.name,
      ownerId: req.userId!,
      members: { create: { userId: req.userId!, role: 'owner' } },
    },
  });
  res.status(201).json({ ...workspace, role: 'owner' });
});

const renameSchema = z.object({ name: z.string().min(1).max(160) });

workspacesRouter.patch('/:id', validateBody(renameSchema), async (req: AuthedRequest, res) => {
  const role = await getMemberRole(req.params.id, req.userId!);
  if (!role) return res.status(404).json({ error: 'Workspace not found' });
  if (!roleAtLeast(role, 'admin')) return res.status(403).json({ error: 'Admin role required' });

  const updated = await prisma.workspace.update({ where: { id: req.params.id }, data: { name: req.body.name } });
  res.json({ ...updated, role });
});

// --- Activity feed (cross-task, most recent first) ---

workspacesRouter.get('/:id/activity', async (req: AuthedRequest, res) => {
  const role = await getMemberRole(req.params.id, req.userId!);
  if (!role) return res.status(404).json({ error: 'Workspace not found' });

  const take = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const skip = Math.max(Number(req.query.offset) || 0, 0);

  const entries = await prisma.activityLogEntry.findMany({
    where: { task: { list: { project: { workspaceId: req.params.id } } } },
    orderBy: { createdAt: 'desc' },
    take,
    skip,
    include: {
      actor: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
    },
  });

  res.json(
    entries.map((e) => ({
      id: e.id,
      type: e.type,
      payload: e.payload,
      createdAt: e.createdAt,
      actorName: e.actor?.name ?? null,
      taskId: e.task.id,
      taskTitle: e.task.title,
    }))
  );
});

// --- Workload (per-member task load across the whole workspace) ---

workspacesRouter.get('/:id/workload', async (req: AuthedRequest, res) => {
  const role = await getMemberRole(req.params.id, req.userId!);
  if (!role) return res.status(404).json({ error: 'Workspace not found' });

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: req.params.id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });

  const now = new Date();
  const tasks = await prisma.task.findMany({
    where: {
      list: { project: { workspaceId: req.params.id } },
      archivedAt: null,
      assignees: { some: {} },
    },
    select: {
      done: true,
      dueDate: true,
      estimatedMinutes: true,
      actualMinutes: true,
      assignees: { select: { userId: true } },
    },
  });

  const byUser = new Map<
    string,
    { totalTasks: number; openTasks: number; doneTasks: number; overdueTasks: number; estimatedMinutes: number; actualMinutes: number }
  >();
  for (const member of members) {
    byUser.set(member.userId, {
      totalTasks: 0,
      openTasks: 0,
      doneTasks: 0,
      overdueTasks: 0,
      estimatedMinutes: 0,
      actualMinutes: 0,
    });
  }

  for (const task of tasks) {
    const overdue = !task.done && !!task.dueDate && task.dueDate < now;
    for (const { userId } of task.assignees) {
      const bucket = byUser.get(userId);
      if (!bucket) continue;
      bucket.totalTasks += 1;
      if (task.done) bucket.doneTasks += 1;
      else bucket.openTasks += 1;
      if (overdue) bucket.overdueTasks += 1;
      bucket.estimatedMinutes += task.estimatedMinutes ?? 0;
      bucket.actualMinutes += task.actualMinutes ?? 0;
    }
  }

  res.json(
    members.map((m) => ({
      userId: m.userId,
      name: m.user.name,
      ...byUser.get(m.userId)!,
    }))
  );
});

// --- Members ---

workspacesRouter.get('/:id/members', async (req: AuthedRequest, res) => {
  const role = await getMemberRole(req.params.id, req.userId!);
  if (!role) return res.status(404).json({ error: 'Workspace not found' });

  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: req.params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(
    members.map((m) => ({ id: m.id, role: m.role, createdAt: m.createdAt, user: m.user }))
  );
});

const changeRoleSchema = z.object({ role: z.enum(ROLES) });

workspacesRouter.patch(
  '/:id/members/:userId',
  validateBody(changeRoleSchema),
  async (req: AuthedRequest, res) => {
    const actorRole = await getMemberRole(req.params.id, req.userId!);
    if (!actorRole) return res.status(404).json({ error: 'Workspace not found' });
    if (!roleAtLeast(actorRole, 'admin')) return res.status(403).json({ error: 'Admin role required' });

    const target = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: req.params.id, userId: req.params.userId } },
    });
    if (!target) return res.status(404).json({ error: 'Member not found' });

    // Granting or revoking ownership, or changing another owner's role, is owner-only.
    if ((target.role === 'owner' || req.body.role === 'owner') && actorRole !== 'owner') {
      return res.status(403).json({ error: 'Only an owner can change ownership' });
    }
    if (target.role === 'owner' && req.body.role !== 'owner' && (await countOwners(req.params.id)) <= 1) {
      return res.status(400).json({ error: 'A workspace must have at least one owner' });
    }

    const updated = await prisma.workspaceMember.update({
      where: { id: target.id },
      data: { role: req.body.role },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    res.json({ id: updated.id, role: updated.role, createdAt: updated.createdAt, user: updated.user });
  }
);

workspacesRouter.delete('/:id/members/:userId', async (req: AuthedRequest, res) => {
  const actorRole = await getMemberRole(req.params.id, req.userId!);
  if (!actorRole) return res.status(404).json({ error: 'Workspace not found' });

  const isSelf = req.params.userId === req.userId;
  if (!isSelf && !roleAtLeast(actorRole, 'admin')) {
    return res.status(403).json({ error: 'Admin role required' });
  }

  const target = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: req.params.id, userId: req.params.userId } },
  });
  if (!target) return res.status(404).json({ error: 'Member not found' });

  if (target.role === 'owner' && (await countOwners(req.params.id)) <= 1) {
    return res.status(400).json({ error: 'A workspace must have at least one owner' });
  }

  await prisma.workspaceMember.delete({ where: { id: target.id } });
  res.status(204).send();
});

// --- Invites ---

workspacesRouter.get('/:id/invites', async (req: AuthedRequest, res) => {
  const role = await getMemberRole(req.params.id, req.userId!);
  if (!role) return res.status(404).json({ error: 'Workspace not found' });
  if (!roleAtLeast(role, 'admin')) return res.status(403).json({ error: 'Admin role required' });

  const invites = await prisma.workspaceInvite.findMany({
    where: { workspaceId: req.params.id, acceptedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  res.json(invites);
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['viewer', 'member', 'admin']).default('member'),
});

workspacesRouter.post('/:id/invites', validateBody(inviteSchema), async (req: AuthedRequest, res) => {
  const actorRole = await getMemberRole(req.params.id, req.userId!);
  if (!actorRole) return res.status(404).json({ error: 'Workspace not found' });
  if (!roleAtLeast(actorRole, 'admin')) return res.status(403).json({ error: 'Admin role required' });

  const existingUser = await prisma.user.findUnique({ where: { email: req.body.email } });

  if (existingUser) {
    const alreadyMember = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: req.params.id, userId: existingUser.id } },
    });
    if (alreadyMember) return res.status(409).json({ error: 'This user is already a member' });

    const [, invite] = await prisma.$transaction([
      prisma.workspaceMember.create({
        data: { workspaceId: req.params.id, userId: existingUser.id, role: req.body.role },
      }),
      prisma.workspaceInvite.create({
        data: {
          workspaceId: req.params.id,
          email: req.body.email,
          role: req.body.role,
          invitedById: req.userId!,
          acceptedAt: new Date(),
        },
      }),
    ]);
    return res.status(201).json({ ...invite, autoAccepted: true });
  }

  const invite = await prisma.workspaceInvite.create({
    data: { workspaceId: req.params.id, email: req.body.email, role: req.body.role, invitedById: req.userId! },
  });
  res.status(201).json({ ...invite, autoAccepted: false });
});

workspacesRouter.delete('/:id/invites/:inviteId', async (req: AuthedRequest, res) => {
  const role = await getMemberRole(req.params.id, req.userId!);
  if (!role) return res.status(404).json({ error: 'Workspace not found' });
  if (!roleAtLeast(role, 'admin')) return res.status(403).json({ error: 'Admin role required' });

  const invite = await prisma.workspaceInvite.findFirst({
    where: { id: req.params.inviteId, workspaceId: req.params.id, acceptedAt: null },
  });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  await prisma.workspaceInvite.delete({ where: { id: invite.id } });
  res.status(204).send();
});
