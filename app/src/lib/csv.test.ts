import { describe, it, expect } from 'vitest';
import { tasksToCsv } from './csv';
import type { Task } from '../types';

function task(overrides: Partial<Task>): Task {
  return {
    id: 't1',
    listId: 'l1',
    parentTaskId: null,
    title: 'Untitled quest',
    priority: 'medium',
    done: false,
    position: 0,
    createdAt: '',
    updatedAt: '',
    progress: 0,
    ...overrides,
  };
}

describe('tasksToCsv', () => {
  it('renders the header row when there are no tasks', () => {
    expect(tasksToCsv([])).toBe('Title,Project,List,Status,Priority,Due Date,Assignees');
  });

  it('renders a basic task row with project/list breadcrumb', () => {
    const csv = tasksToCsv([
      task({
        title: 'Clear the gate',
        priority: 'high',
        done: true,
        list: { id: 'l1', name: 'Preparation', project: { id: 'p1', name: 'Red Gate' } },
      }),
    ]);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('Clear the gate,Red Gate,Preparation,Done,high,,');
  });

  it('formats the due date as YYYY-MM-DD', () => {
    const csv = tasksToCsv([task({ title: 'Due soon', dueDate: '2026-08-06T00:00:00.000Z' })]);
    expect(csv.split('\n')[1]).toBe('Due soon,,,Open,medium,2026-08-06,');
  });

  it('joins multiple assignees with a semicolon', () => {
    const csv = tasksToCsv([
      task({ title: 'Team quest', assignees: [{ id: 'u1', name: 'Cha Hae-In' }, { id: 'u2', name: 'Baek Yoonho' }] }),
    ]);
    expect(csv.split('\n')[1]).toBe('Team quest,,,Open,medium,,Cha Hae-In; Baek Yoonho');
  });

  it('quotes and escapes fields containing commas, quotes, or newlines', () => {
    const csv = tasksToCsv([task({ title: 'Say "hi", then go\nnow' })]);
    expect(csv.split('\n').slice(1).join('\n')).toBe('"Say ""hi"", then go\nnow",,,Open,medium,,');
  });

  it('renders one row per task in the given order', () => {
    const csv = tasksToCsv([task({ id: 't1', title: 'First' }), task({ id: 't2', title: 'Second' })]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^First,/);
    expect(lines[2]).toMatch(/^Second,/);
  });
});
