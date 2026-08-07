import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { buildSubtaskTree, computeTaskProgress } from '../services/subtask.service.js';

// No requireAuth here — this router intentionally serves unauthenticated public
// reads for tasks whose owner has generated a share link. The payload is a
// deliberately narrow, read-only projection: no custom fields, attachments,
// assignees, dependencies/relations, or time entries, since those could leak
// information about the wider workspace beyond what was explicitly shared.
export const publicRouter = Router();

publicRouter.get('/tasks/:token', async (req, res) => {
  const task = await prisma.task.findUnique({
    where: { shareToken: req.params.token },
    include: {
      list: { include: { project: true } },
      status: { select: { name: true, color: true, isCompleted: true } },
    },
  });
  if (!task || task.archivedAt) return res.status(404).json({ error: 'This link is invalid or has been revoked' });

  const [subtasks, comments, progress] = await Promise.all([
    buildSubtaskTree(task.id),
    prisma.comment.findMany({
      where: { taskId: task.id },
      orderBy: { createdAt: 'asc' },
      include: { author: { select: { name: true } } },
    }),
    computeTaskProgress(task.id),
  ]);

  res.json({
    id: task.id,
    title: task.title,
    description: task.description,
    priority: task.priority,
    done: task.done,
    status: task.status,
    startDate: task.startDate,
    dueDate: task.dueDate,
    progress,
    projectName: task.list.project.name,
    listName: task.list.name,
    subtasks,
    comments: comments.map((c) => ({ authorName: c.author.name, body: c.body, createdAt: c.createdAt })),
  });
});
