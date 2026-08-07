import { describe, it, expect } from 'vitest';
import { computeTimelineRange, computeTaskBar, daysBetween } from './timeline';
import type { Task } from '../types';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    listId: 'l1',
    parentTaskId: null,
    title: 'Quest',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '',
    progress: 0,
    ...overrides,
  };
}

const TODAY = new Date('2026-08-10T12:00:00.000Z');

describe('daysBetween', () => {
  it('counts whole UTC days regardless of time-of-day', () => {
    expect(daysBetween(new Date('2026-08-01T23:00:00Z'), new Date('2026-08-02T01:00:00Z'))).toBe(1);
    expect(daysBetween(new Date('2026-08-01T00:00:00Z'), new Date('2026-08-01T23:59:00Z'))).toBe(0);
  });
});

describe('computeTimelineRange', () => {
  it('falls back to a two-week window starting today when nothing is scheduled', () => {
    const range = computeTimelineRange([task({ startDate: null, dueDate: null })], TODAY);
    expect(range.days).toHaveLength(14);
    expect(range.days[0].toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('spans the earliest start date to the latest due date across tasks', () => {
    const range = computeTimelineRange(
      [
        task({ id: 't1', startDate: '2026-08-05T00:00:00.000Z', dueDate: '2026-08-07T00:00:00.000Z' }),
        task({ id: 't2', startDate: null, dueDate: '2026-08-20T00:00:00.000Z' }),
      ],
      TODAY
    );
    expect(range.days[0].toISOString().slice(0, 10)).toBe('2026-08-05');
    expect(range.days[range.days.length - 1].toISOString().slice(0, 10)).toBe('2026-08-20');
  });

  it('always includes today even if every task is scheduled elsewhere', () => {
    const range = computeTimelineRange(
      [task({ startDate: '2026-09-01T00:00:00.000Z', dueDate: '2026-09-03T00:00:00.000Z' })],
      TODAY
    );
    expect(range.days[0].toISOString().slice(0, 10)).toBe('2026-08-10');
    expect(range.days[range.days.length - 1].toISOString().slice(0, 10)).toBe('2026-09-03');
  });
});

describe('computeTaskBar', () => {
  const range = computeTimelineRange(
    [task({ startDate: '2026-08-05T00:00:00.000Z', dueDate: '2026-08-14T00:00:00.000Z' })],
    TODAY
  );

  it('returns null for a task with neither date set', () => {
    expect(computeTaskBar(task({ startDate: null, dueDate: null }), range)).toBeNull();
  });

  it('spans from startDate to dueDate inclusive', () => {
    const bar = computeTaskBar(
      task({ startDate: '2026-08-06T00:00:00.000Z', dueDate: '2026-08-08T00:00:00.000Z' }),
      range
    );
    expect(bar).toEqual({ taskId: 't1', startOffset: 1, span: 3 });
  });

  it('treats a due-date-only task as a single-day bar', () => {
    const bar = computeTaskBar(task({ startDate: null, dueDate: '2026-08-05T00:00:00.000Z' }), range);
    expect(bar).toEqual({ taskId: 't1', startOffset: 0, span: 1 });
  });

  it('treats a start-date-only task as a single-day bar', () => {
    const bar = computeTaskBar(task({ startDate: '2026-08-07T00:00:00.000Z', dueDate: null }), range);
    expect(bar).toEqual({ taskId: 't1', startOffset: 2, span: 1 });
  });

  it('swaps a reversed start/due pair rather than producing a negative span', () => {
    const bar = computeTaskBar(
      task({ startDate: '2026-08-10T00:00:00.000Z', dueDate: '2026-08-06T00:00:00.000Z' }),
      range
    );
    expect(bar).toEqual({ taskId: 't1', startOffset: 1, span: 5 });
  });
});
