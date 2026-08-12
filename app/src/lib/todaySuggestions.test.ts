import { describe, it, expect } from 'vitest';
import { selectTodayTasks, computeTodaySuggestions, startsToday } from './todaySuggestions';
import type { Task, TodayEntryStatus } from '../types';

const TODAY = '2026-08-12';

function baseTask(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    listId: 'l1',
    parentTaskId: null,
    title: 'Untitled',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    ...overrides,
  };
}

function entries(pairs: [string, TodayEntryStatus][]): Record<string, TodayEntryStatus> {
  return Object.fromEntries(pairs);
}

describe('startsToday', () => {
  it('is true for a task whose startDate falls on the given day', () => {
    expect(startsToday(baseTask({ startDate: '2026-08-12T00:00:00.000Z' }), TODAY)).toBe(true);
  });
  it('is false for a task with no startDate', () => {
    expect(startsToday(baseTask({}), TODAY)).toBe(false);
  });
  it('is false for a task starting a different day', () => {
    expect(startsToday(baseTask({ startDate: '2026-08-13T00:00:00.000Z' }), TODAY)).toBe(false);
  });
});

describe('selectTodayTasks', () => {
  it('automatically includes a task with a startDate of today', () => {
    const startsTodayTask = baseTask({ id: 'a', startDate: `${TODAY}T00:00:00.000Z` });
    const result = selectTodayTasks([startsTodayTask], entries([]), TODAY);
    expect(result.map((t) => t.id)).toEqual(['a']);
  });

  it('excludes a task with no startDate-today and no entry', () => {
    const other = baseTask({ id: 'b', dueDate: '2026-09-01T00:00:00.000Z' });
    expect(selectTodayTasks([other], entries([]), TODAY)).toEqual([]);
  });

  it('includes a manually-added task regardless of its dates', () => {
    const manual = baseTask({ id: 'c', dueDate: '2026-09-01T00:00:00.000Z' });
    const result = selectTodayTasks([manual], entries([['c', 'added']]), TODAY);
    expect(result.map((t) => t.id)).toEqual(['c']);
  });

  it('a dismissed entry overrides automatic startDate-today inclusion', () => {
    const startsTodayTask = baseTask({ id: 'd', startDate: `${TODAY}T00:00:00.000Z` });
    const result = selectTodayTasks([startsTodayTask], entries([['d', 'dismissed']]), TODAY);
    expect(result).toEqual([]);
  });

  it('excludes completed and archived tasks even if manually added', () => {
    const done = baseTask({ id: 'e', done: true });
    const archived = baseTask({ id: 'f', archivedAt: '2026-08-01T00:00:00.000Z' });
    const result = selectTodayTasks([done, archived], entries([['e', 'added'], ['f', 'added']]), TODAY);
    expect(result).toEqual([]);
  });
});

describe('computeTodaySuggestions', () => {
  it('suggests an overdue task with the highest score, worst-overdue first', () => {
    const mildlyOverdue = baseTask({ id: 'a', dueDate: '2026-08-10T00:00:00.000Z' }); // 2 days overdue
    const badlyOverdue = baseTask({ id: 'b', dueDate: '2026-08-05T00:00:00.000Z' }); // 7 days overdue
    const suggestions = computeTodaySuggestions([mildlyOverdue, badlyOverdue], entries([]), TODAY);
    expect(suggestions.map((s) => s.task.id)).toEqual(['b', 'a']);
    expect(suggestions[0].reason).toBe('Overdue by 7 days');
    expect(suggestions[1].reason).toBe('Overdue by 2 days');
  });

  it('suggests a task due today with reason "Due today"', () => {
    const task = baseTask({ id: 'a', dueDate: `${TODAY}T00:00:00.000Z` });
    const suggestions = computeTodaySuggestions([task], entries([]), TODAY);
    expect(suggestions).toEqual([{ task, reason: 'Due today' }]);
  });

  it('suggests a task due tomorrow with reason "Due tomorrow"', () => {
    const task = baseTask({ id: 'a', dueDate: '2026-08-13T00:00:00.000Z' });
    const suggestions = computeTodaySuggestions([task], entries([]), TODAY);
    expect(suggestions).toEqual([{ task, reason: 'Due tomorrow' }]);
  });

  it('suggests a task due within 3 days with a day-count reason', () => {
    const task = baseTask({ id: 'a', dueDate: '2026-08-15T00:00:00.000Z' });
    const suggestions = computeTodaySuggestions([task], entries([]), TODAY);
    expect(suggestions).toEqual([{ task, reason: 'Due in 3 days' }]);
  });

  it('does not suggest a task due more than 3 days out', () => {
    const task = baseTask({ id: 'a', dueDate: '2026-08-20T00:00:00.000Z' });
    expect(computeTodaySuggestions([task], entries([]), TODAY)).toEqual([]);
  });

  it('suggests a high-priority task with no due date, ranked below any dated suggestion', () => {
    const highPriority = baseTask({ id: 'a', priority: 'high' });
    const dueToday = baseTask({ id: 'b', dueDate: `${TODAY}T00:00:00.000Z` });
    const suggestions = computeTodaySuggestions([highPriority, dueToday], entries([]), TODAY);
    expect(suggestions.map((s) => s.task.id)).toEqual(['b', 'a']);
  });

  it('does not suggest a medium/low-priority task with no due date', () => {
    const medium = baseTask({ id: 'a', priority: 'medium' });
    const low = baseTask({ id: 'b', priority: 'low' });
    expect(computeTodaySuggestions([medium, low], entries([]), TODAY)).toEqual([]);
  });

  it('never suggests a task already in Today\'s Tasks via startDate (avoid duplicates)', () => {
    const task = baseTask({ id: 'a', startDate: `${TODAY}T00:00:00.000Z`, dueDate: '2026-08-05T00:00:00.000Z' });
    expect(computeTodaySuggestions([task], entries([]), TODAY)).toEqual([]);
  });

  it('never suggests a task the user already manually added (avoid duplicates)', () => {
    const task = baseTask({ id: 'a', dueDate: '2026-08-05T00:00:00.000Z' });
    expect(computeTodaySuggestions([task], entries([['a', 'added']]), TODAY)).toEqual([]);
  });

  it('never re-suggests a task the user dismissed today', () => {
    const task = baseTask({ id: 'a', dueDate: '2026-08-05T00:00:00.000Z' });
    expect(computeTodaySuggestions([task], entries([['a', 'dismissed']]), TODAY)).toEqual([]);
  });

  it('excludes done and archived tasks from suggestions', () => {
    const done = baseTask({ id: 'a', dueDate: '2026-08-05T00:00:00.000Z', done: true });
    const archived = baseTask({ id: 'b', dueDate: '2026-08-05T00:00:00.000Z', archivedAt: '2026-08-01T00:00:00.000Z' });
    expect(computeTodaySuggestions([done, archived], entries([]), TODAY)).toEqual([]);
  });

  it('caps suggestions at 8, keeping the highest-scored ones', () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      baseTask({ id: `t${i}`, dueDate: `2026-08-${String(1 + i).padStart(2, '0')}T00:00:00.000Z` })
    );
    const suggestions = computeTodaySuggestions(tasks, entries([]), TODAY);
    expect(suggestions).toHaveLength(8);
    // most-overdue (earliest due date) should be first, and should have survived the cap
    expect(suggestions[0].task.id).toBe('t0');
  });
});
