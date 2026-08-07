import type { RecurrenceRule } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getDefaultStatusId } from './status.service.js';
import { logActivity } from './activity.service.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

/**
 * Advances `from` by one recurrence step. Monthly/yearly steps use the calendar
 * (setUTCMonth/setUTCFullYear), so they can roll into the next month on short
 * months (e.g. Jan 31 + 1 month -> Mar 3) the same way native Date arithmetic
 * always does — callers relying on exact day-of-month should avoid month-end anchors.
 */
export function computeNextDueDate(
  from: Date,
  frequency: RecurrenceRule['frequency'],
  interval: number,
  skipWeekends: boolean
): Date {
  const next = new Date(from.getTime());
  switch (frequency) {
    case 'daily':
      next.setUTCDate(next.getUTCDate() + interval);
      break;
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + interval * 7);
      break;
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + interval);
      break;
    case 'yearly':
      next.setUTCFullYear(next.getUTCFullYear() + interval);
      break;
  }
  if (skipWeekends) {
    while (isWeekend(next)) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  }
  return next;
}

/**
 * Clones `sourceTask` into rule.listId with the given due date, carrying over
 * its custom field values, and links the clone back to the rule. Deactivates
 * the rule instead of creating a task once maxOccurrences/endDate is reached.
 */
async function createOccurrence(
  rule: RecurrenceRule,
  sourceTask: { id: string; title: string; description: string | null; priority: string; color: string | null; estimatedMinutes: number | null },
  dueDate: Date,
  actorId: string | null
): Promise<string | null> {
  if (rule.maxOccurrences !== null && rule.occurrenceCount >= rule.maxOccurrences) {
    await prisma.recurrenceRule.update({ where: { id: rule.id }, data: { active: false } });
    await logActivity(sourceTask.id, actorId, 'recurrence_ended', { reason: 'max_occurrences_reached' });
    return null;
  }
  if (rule.endDate && dueDate.getTime() > rule.endDate.getTime()) {
    await prisma.recurrenceRule.update({ where: { id: rule.id }, data: { active: false } });
    await logActivity(sourceTask.id, actorId, 'recurrence_ended', { reason: 'end_date_reached' });
    return null;
  }

  const list = await prisma.todoList.findUniqueOrThrow({ where: { id: rule.listId } });
  const [maxPosition, defaultStatusId, sourceValues] = await Promise.all([
    prisma.task.aggregate({ where: { listId: rule.listId, parentTaskId: null }, _max: { position: true } }),
    getDefaultStatusId(list.projectId, false),
    prisma.customFieldValue.findMany({ where: { taskId: sourceTask.id } }),
  ]);

  const created = await prisma.task.create({
    data: {
      listId: rule.listId,
      title: sourceTask.title,
      description: sourceTask.description,
      priority: sourceTask.priority as never,
      statusId: defaultStatusId,
      color: sourceTask.color,
      estimatedMinutes: sourceTask.estimatedMinutes,
      dueDate,
      position: (maxPosition._max.position ?? 0) + 1,
      recurrenceRuleId: rule.id,
    },
  });

  if (sourceValues.length > 0) {
    await prisma.customFieldValue.createMany({
      data: sourceValues.map((v) => ({ fieldId: v.fieldId, taskId: created.id, value: v.value as never })),
    });
  }

  await prisma.recurrenceRule.update({
    where: { id: rule.id },
    data: { occurrenceCount: { increment: 1 }, nextRunAt: dueDate },
  });

  await logActivity(sourceTask.id, actorId, 'recurrence_spawned', { newTaskId: created.id, dueDate: dueDate.toISOString() });
  await logActivity(created.id, actorId, 'task_created', { title: created.title, recurring: true });

  return created.id;
}

/**
 * Called right after a task transitions to done. Only after_completion-mode
 * recurrences spawn here; fixed_schedule recurrences are driven purely by
 * runRecurrenceScheduler so their cadence never depends on when someone
 * actually checks the box.
 */
export async function maybeSpawnOnCompletion(taskId: string, actorId: string | null): Promise<string | null> {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { recurrenceRule: true } });
  if (!task || !task.recurrenceRule || !task.recurrenceRule.active) return null;
  const rule = task.recurrenceRule;
  if (rule.mode !== 'after_completion') return null;

  const nextDue = computeNextDueDate(new Date(), rule.frequency, rule.interval, rule.skipWeekends);
  return createOccurrence(rule, task, nextDue, actorId);
}

/**
 * One tick of the fixed-schedule scheduler: spawns the next occurrence for
 * every active fixed_schedule rule whose nextRunAt has arrived, regardless of
 * whether the current occurrence was ever completed. Clones from the most
 * recently created task in the series. Returns the number of tasks spawned.
 */
export async function runRecurrenceScheduler(now: Date = new Date()): Promise<number> {
  const dueRules = await prisma.recurrenceRule.findMany({
    where: { active: true, mode: 'fixed_schedule', nextRunAt: { lte: now } },
  });

  let spawned = 0;
  for (const rule of dueRules) {
    const latest = await prisma.task.findFirst({
      where: { recurrenceRuleId: rule.id },
      orderBy: { createdAt: 'desc' },
    });
    if (!latest || !rule.nextRunAt) continue;

    const dueDate = rule.nextRunAt;
    const nextAfter = computeNextDueDate(dueDate, rule.frequency, rule.interval, rule.skipWeekends);
    const createdId = await createOccurrence(rule, latest, dueDate, null);
    if (createdId) {
      // createOccurrence already set nextRunAt = dueDate (the occurrence it just spawned);
      // advance it one more step so the next tick targets the following occurrence.
      await prisma.recurrenceRule.update({ where: { id: rule.id }, data: { nextRunAt: nextAfter } });
      spawned += 1;
    }
  }
  return spawned;
}

let schedulerHandle: ReturnType<typeof setInterval> | null = null;

/** Starts the periodic fixed-schedule tick. No-op if already running. */
export function startRecurrenceScheduler(intervalMs = 60_000): void {
  if (schedulerHandle) return;
  schedulerHandle = setInterval(() => {
    runRecurrenceScheduler().catch((err) => console.error('Recurrence scheduler tick failed:', err));
  }, intervalMs);
  schedulerHandle.unref?.();
}

export function stopRecurrenceScheduler(): void {
  if (schedulerHandle) {
    clearInterval(schedulerHandle);
    schedulerHandle = null;
  }
}
