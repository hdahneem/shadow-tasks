import type { NotificationType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

/** Creates a notification for each recipient, skipping the actor (never notify someone about their own action),
 * duplicates, and anyone who has muted this notification type. */
export async function notifyUsers(
  userIds: string[],
  opts: { taskId: string; type: NotificationType; actorId: string | null; payload?: Record<string, unknown> }
): Promise<void> {
  const candidates = Array.from(new Set(userIds)).filter((id) => id !== opts.actorId);
  if (candidates.length === 0) return;

  const muted = await prisma.notificationPreference.findMany({
    where: { userId: { in: candidates }, type: opts.type },
    select: { userId: true },
  });
  const mutedIds = new Set(muted.map((m) => m.userId));
  const recipients = candidates.filter((id) => !mutedIds.has(id));
  if (recipients.length === 0) return;

  await prisma.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      taskId: opts.taskId,
      type: opts.type,
      actorId: opts.actorId,
      payload: (opts.payload ?? undefined) as never,
    })),
  });
}

/**
 * Matches `@FirstName` tokens in a comment body against workspace members' first
 * names (case-insensitive). A simple convention rather than a full mention-picker
 * with structured `@[Name](userId)` tagging — good enough to notify people without
 * requiring autocomplete UI, at the cost of possible false positives/misses on
 * ambiguous or multi-word names.
 */
export function extractMentionedUserIds(
  body: string,
  members: { userId: string; firstName: string }[]
): string[] {
  const tokens = Array.from(body.matchAll(/@(\w+)/g)).map((m) => m[1].toLowerCase());
  if (tokens.length === 0) return [];
  const tokenSet = new Set(tokens);
  return members.filter((m) => tokenSet.has(m.firstName.toLowerCase())).map((m) => m.userId);
}

/**
 * Notifies assignees of any task due within `windowMs` (default 24h) that hasn't
 * already been flagged, then marks it flagged so later ticks don't repeat it.
 * Flag is cleared whenever a task's due date changes (see tasks.routes.ts).
 */
export async function runDueSoonScheduler(now: Date = new Date(), windowMs = 24 * 60 * 60 * 1000): Promise<number> {
  const horizon = new Date(now.getTime() + windowMs);
  const tasks = await prisma.task.findMany({
    where: {
      done: false,
      archivedAt: null,
      dueDate: { gte: now, lte: horizon },
      dueSoonNotifiedAt: null,
      assignees: { some: {} },
    },
    include: { assignees: true },
  });

  for (const task of tasks) {
    await notifyUsers(
      task.assignees.map((a) => a.userId),
      { taskId: task.id, type: 'due_soon', actorId: null, payload: { dueDate: task.dueDate } }
    );
    await prisma.task.update({ where: { id: task.id }, data: { dueSoonNotifiedAt: now } });
  }
  return tasks.length;
}

let schedulerHandle: ReturnType<typeof setInterval> | null = null;

export function startDueSoonScheduler(intervalMs = 15 * 60_000): void {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(() => {
    runDueSoonScheduler().catch((err) => console.error('Due-soon scheduler tick failed:', err));
  }, intervalMs);
  schedulerHandle.unref?.();
}

export function stopDueSoonScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}
