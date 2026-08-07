import type { Task } from '../types';

/**
 * All date-key math is done in UTC. dueDate is stored as a full ISO datetime,
 * always midnight UTC for a plain date picked in the UI (`new Date('2026-08-10')`
 * parses as UTC midnight) — so keying everything off `toISOString().slice(0, 10)`
 * keeps grid cells and task buckets aligned regardless of the viewer's local
 * timezone, instead of drifting a day in either direction near midnight.
 */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function todayKey(): string {
  return dateKey(new Date());
}

/** Returns the 42 (6 weeks x 7 days) UTC dates that make up a month's calendar grid,
 * including the leading/trailing days from adjacent months needed to fill full weeks. */
export function getMonthGrid(year: number, month: number): Date[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startWeekday = firstOfMonth.getUTCDay(); // 0 = Sunday
  const gridStart = new Date(Date.UTC(year, month, 1 - startWeekday));

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setUTCDate(gridStart.getUTCDate() + i);
    return d;
  });
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

export function isSameMonth(date: Date, year: number, month: number): boolean {
  return date.getUTCFullYear() === year && date.getUTCMonth() === month;
}

/** Groups tasks that have a dueDate by their date key. Tasks with no dueDate are omitted —
 * callers that need the unscheduled set should filter `!task.dueDate` separately. */
export function groupTasksByDate(tasks: Task[]): Map<string, Task[]> {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    const key = dateKey(new Date(task.dueDate));
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(task);
  }
  return map;
}

export function isOverdue(task: Task): boolean {
  if (task.done || !task.dueDate) return false;
  return dateKey(new Date(task.dueDate)) < todayKey();
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}
