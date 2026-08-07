import type { Task } from '../types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Normalizes to a UTC-midnight day count so bar math is immune to time-of-day noise. */
function dayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / DAY_MS);
}

export function daysBetween(a: Date, b: Date): number {
  return dayNumber(b) - dayNumber(a);
}

export interface TimelineRange {
  start: Date;
  end: Date;
  days: Date[];
}

/**
 * Spans every scheduled task's dates plus today, so "today" is always visible even
 * if nothing is due yet. Projects with no scheduled tasks fall back to a two-week
 * window starting today, rather than rendering an empty range.
 */
export function computeTimelineRange(tasks: Task[], today: Date = new Date()): TimelineRange {
  const dates: Date[] = [today];
  for (const task of tasks) {
    if (task.startDate) dates.push(new Date(task.startDate));
    if (task.dueDate) dates.push(new Date(task.dueDate));
  }

  const scheduled = dates.length > 1;
  let start: Date;
  let end: Date;
  if (scheduled) {
    const nums = dates.map(dayNumber);
    start = new Date(Math.min(...nums) * DAY_MS);
    end = new Date(Math.max(...nums) * DAY_MS);
  } else {
    start = new Date(dayNumber(today) * DAY_MS);
    end = new Date((dayNumber(today) + 13) * DAY_MS);
  }

  const spanDays = daysBetween(start, end) + 1;
  const days = Array.from({ length: spanDays }, (_, i) => new Date(start.getTime() + i * DAY_MS));
  return { start, end, days };
}

export interface TimelineBar {
  taskId: string;
  startOffset: number;
  span: number;
}

/** Returns null for tasks with neither a start nor due date — callers should list those separately as unscheduled. */
export function computeTaskBar(task: Task, range: TimelineRange): TimelineBar | null {
  if (!task.startDate && !task.dueDate) return null;

  const rawStart = new Date(task.startDate ?? task.dueDate!);
  const rawEnd = new Date(task.dueDate ?? task.startDate!);
  const [effectiveStart, effectiveEnd] = rawStart.getTime() <= rawEnd.getTime() ? [rawStart, rawEnd] : [rawEnd, rawStart];

  const startOffset = Math.max(0, daysBetween(range.start, effectiveStart));
  const span = Math.max(1, daysBetween(effectiveStart, effectiveEnd) + 1);

  return { taskId: task.id, startOffset, span };
}
