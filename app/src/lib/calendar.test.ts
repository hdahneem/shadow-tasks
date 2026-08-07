import { describe, it, expect } from 'vitest';
import {
  dateKey,
  getMonthGrid,
  addMonths,
  isSameMonth,
  groupTasksByDate,
  isOverdue,
  monthLabel,
} from './calendar';
import type { Task } from '../types';

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

describe('getMonthGrid', () => {
  it('always returns exactly 42 dates (6 full weeks)', () => {
    expect(getMonthGrid(2026, 1)).toHaveLength(42); // February 2026
    expect(getMonthGrid(2026, 0)).toHaveLength(42); // January 2026
  });

  it('starts on a Sunday and ends on a Saturday', () => {
    const grid = getMonthGrid(2026, 7); // August 2026
    expect(grid[0].getUTCDay()).toBe(0);
    expect(grid[41].getUTCDay()).toBe(6);
  });

  it('includes every day of the target month', () => {
    const grid = getMonthGrid(2026, 1); // February 2026 has 28 days
    const daysInMonth = grid.filter((d) => isSameMonth(d, 2026, 1));
    expect(daysInMonth).toHaveLength(28);
  });

  it('spans a December->January year boundary correctly', () => {
    const grid = getMonthGrid(2026, 11); // December 2026
    expect(grid.some((d) => d.getUTCFullYear() === 2027 && d.getUTCMonth() === 0)).toBe(true);
    const decemberDays = grid.filter((d) => isSameMonth(d, 2026, 11));
    expect(decemberDays).toHaveLength(31);
  });
});

describe('addMonths', () => {
  it('rolls over into the next year', () => {
    expect(addMonths(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });
  it('rolls back into the previous year', () => {
    expect(addMonths(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });
});

describe('groupTasksByDate', () => {
  it('buckets tasks by their UTC date key and omits undated tasks', () => {
    const tasks = [
      baseTask({ id: 'a', dueDate: '2026-08-10T00:00:00.000Z' }),
      baseTask({ id: 'b', dueDate: '2026-08-10T00:00:00.000Z' }),
      baseTask({ id: 'c', dueDate: '2026-08-11T00:00:00.000Z' }),
      baseTask({ id: 'd', dueDate: undefined }),
    ];
    const grouped = groupTasksByDate(tasks);
    expect(grouped.get('2026-08-10')).toHaveLength(2);
    expect(grouped.get('2026-08-11')).toHaveLength(1);
    expect(grouped.has('undefined')).toBe(false);
    expect([...grouped.values()].flat()).toHaveLength(3);
  });
});

describe('isOverdue', () => {
  it('flags a past-due, not-done task as overdue', () => {
    expect(isOverdue(baseTask({ dueDate: '2000-01-01T00:00:00.000Z', done: false }))).toBe(true);
  });
  it('does not flag a completed task even if its due date has passed', () => {
    expect(isOverdue(baseTask({ dueDate: '2000-01-01T00:00:00.000Z', done: true }))).toBe(false);
  });
  it('does not flag a task with no due date', () => {
    expect(isOverdue(baseTask({ dueDate: undefined }))).toBe(false);
  });
  it('does not flag a future due date', () => {
    expect(isOverdue(baseTask({ dueDate: '2999-01-01T00:00:00.000Z' }))).toBe(false);
  });
});

describe('dateKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(dateKey(new Date(Date.UTC(2026, 7, 3)))).toBe('2026-08-03');
  });
});

describe('monthLabel', () => {
  it('renders a human month + year', () => {
    expect(monthLabel(2026, 7)).toBe('August 2026');
  });
});
