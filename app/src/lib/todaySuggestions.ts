import type { Task, TodayEntryStatus } from '../types';
import { dateKey, todayKey } from './calendar';

export interface TodaySuggestion {
  task: Task;
  reason: string;
}

const MAX_SUGGESTIONS = 8;

function daysBetween(fromKey: string, toKey: string): number {
  const from = new Date(`${fromKey}T00:00:00.000Z`).getTime();
  const to = new Date(`${toKey}T00:00:00.000Z`).getTime();
  return Math.round((to - from) / (24 * 60 * 60 * 1000));
}

function isEligible(task: Task): boolean {
  return !task.done && !task.archivedAt;
}

export function startsToday(task: Task, today = todayKey()): boolean {
  return !!task.startDate && dateKey(new Date(task.startDate)) === today;
}

/**
 * Whether a single task belongs in Today's Tasks right now: anything with a
 * startDate of today (automatic, per spec) or an explicit 'added' entry. A
 * 'dismissed' entry always wins over both, so a startDate-today task can
 * still be removed from view if the user doesn't want it there. Shared by
 * selectTodayTasks (the full list) and any single-task "is this in today?"
 * check, e.g. the toggle button on a task's detail page.
 */
export function isInTodayList(task: Task, entries: Record<string, TodayEntryStatus>, today = todayKey()): boolean {
  if (!isEligible(task)) return false;
  const status = entries[task.id];
  if (status === 'dismissed') return false;
  if (status === 'added') return true;
  return startsToday(task, today);
}

export function selectTodayTasks(
  tasks: Task[],
  entries: Record<string, TodayEntryStatus>,
  today = todayKey()
): Task[] {
  return tasks.filter((task) => isInTodayList(task, entries, today));
}

/**
 * Deterministic, explainable scoring heuristic — overdue tasks score highest
 * (the more overdue, the higher), then due today, due tomorrow, due within a
 * few days, then high-priority tasks with no date at all. Every candidate
 * already surfaced elsewhere is excluded so nothing is ever suggested twice:
 * tasks already in Today's Tasks (via a startDate of today or an explicit
 * 'added' entry) and tasks the user has already dismissed for today.
 */
export function computeTodaySuggestions(
  tasks: Task[],
  entries: Record<string, TodayEntryStatus>,
  today = todayKey()
): TodaySuggestion[] {
  const scored: (TodaySuggestion & { score: number })[] = [];

  for (const task of tasks) {
    if (!isEligible(task)) continue;
    const status = entries[task.id];
    if (status === 'added' || status === 'dismissed') continue;
    if (startsToday(task, today)) continue;

    if (task.dueDate) {
      const diff = daysBetween(today, dateKey(new Date(task.dueDate)));
      if (diff < 0) {
        const overdueDays = -diff;
        scored.push({
          task,
          reason: `Overdue by ${overdueDays} day${overdueDays === 1 ? '' : 's'}`,
          score: 100 + overdueDays,
        });
      } else if (diff === 0) {
        scored.push({ task, reason: 'Due today', score: 90 });
      } else if (diff === 1) {
        scored.push({ task, reason: 'Due tomorrow', score: 70 });
      } else if (diff <= 3) {
        scored.push({ task, reason: `Due in ${diff} days`, score: 50 - diff });
      }
      // due further out than 3 days — not suggested
      continue;
    }

    if (task.priority === 'high') {
      scored.push({ task, reason: 'High priority', score: 30 });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_SUGGESTIONS).map(({ task, reason }) => ({ task, reason }));
}
