import { Router } from 'express';
import { z } from 'zod';
import type { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const NOTIFICATION_TYPES: NotificationType[] = ['assigned', 'comment_added', 'mentioned', 'due_soon'];

notificationsRouter.get('/preferences', async (req: AuthedRequest, res) => {
  const muted = await prisma.notificationPreference.findMany({
    where: { userId: req.userId! },
    select: { type: true },
  });
  const mutedSet = new Set(muted.map((m) => m.type));
  res.json(NOTIFICATION_TYPES.map((type) => ({ type, muted: mutedSet.has(type) })));
});

const preferenceSchema = z.object({ muted: z.boolean() });

notificationsRouter.put(
  '/preferences/:type',
  validateBody(preferenceSchema),
  async (req: AuthedRequest, res) => {
    const type = req.params.type as NotificationType;
    if (!NOTIFICATION_TYPES.includes(type)) return res.status(400).json({ error: 'Invalid notification type' });

    if (req.body.muted) {
      await prisma.notificationPreference.upsert({
        where: { userId_type: { userId: req.userId!, type } },
        create: { userId: req.userId!, type },
        update: {},
      });
    } else {
      await prisma.notificationPreference.deleteMany({ where: { userId: req.userId!, type } });
    }
    res.json({ type, muted: req.body.muted });
  }
);

notificationsRouter.get('/', async (req: AuthedRequest, res) => {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: req.userId! },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        task: { select: { id: true, title: true } },
        actor: { select: { id: true, name: true } },
      },
    }),
    prisma.notification.count({ where: { userId: req.userId!, readAt: null } }),
  ]);

  res.json({
    notifications: notifications.map((n) => ({
      id: n.id,
      type: n.type,
      taskId: n.task.id,
      taskTitle: n.task.title,
      actorName: n.actor?.name ?? null,
      payload: n.payload,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    unreadCount,
  });
});

notificationsRouter.post('/:id/read', async (req: AuthedRequest, res) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!notification) return res.status(404).json({ error: 'Notification not found' });

  const updated = await prisma.notification.update({
    where: { id: notification.id },
    data: { readAt: notification.readAt ?? new Date() },
  });
  res.json(updated);
});

notificationsRouter.post('/read-all', async (req: AuthedRequest, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.userId!, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(204).send();
});

notificationsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const notification = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.userId! },
  });
  if (!notification) return res.status(404).json({ error: 'Notification not found' });

  await prisma.notification.delete({ where: { id: notification.id } });
  res.status(204).send();
});
