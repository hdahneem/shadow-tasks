import { describe, it, expect } from 'vitest';
import { parseTasksCsv } from './csvImport';
import { tasksToCsv } from './csv';
import type { Task } from '../types';

describe('parseTasksCsv', () => {
  it('parses a simple CSV with just a Title column', () => {
    const csv = 'Title\nClear the gate\nScout ahead';
    expect(parseTasksCsv(csv)).toEqual([{ title: 'Clear the gate' }, { title: 'Scout ahead' }]);
  });

  it('parses Priority when it is a recognized value, case-insensitively', () => {
    const csv = 'Title,Priority\nUrgent quest,HIGH\nCasual quest,low\nWeird quest,extreme';
    expect(parseTasksCsv(csv)).toEqual([
      { title: 'Urgent quest', priority: 'high' },
      { title: 'Casual quest', priority: 'low' },
      { title: 'Weird quest' },
    ]);
  });

  it('parses Due Date when it is a valid date', () => {
    const csv = 'Title,Due Date\nDeadline quest,2026-08-06\nNo date quest,\nBad date quest,not-a-date';
    const rows = parseTasksCsv(csv);
    expect(rows[0]).toMatchObject({ title: 'Deadline quest' });
    expect(new Date(rows[0].dueDate!).toISOString().slice(0, 10)).toBe('2026-08-06');
    expect(rows[1]).toEqual({ title: 'No date quest' });
    expect(rows[2]).toEqual({ title: 'Bad date quest' });
  });

  it('handles quoted fields with embedded commas, quotes, and newlines', () => {
    const csv = 'Title,Priority\n"Say ""hi"", then go\nnow",medium';
    expect(parseTasksCsv(csv)).toEqual([{ title: 'Say "hi", then go\nnow', priority: 'medium' }]);
  });

  it('skips blank rows and rows with an empty title', () => {
    const csv = 'Title,Priority\nReal quest,high\n,medium\n';
    expect(parseTasksCsv(csv)).toEqual([{ title: 'Real quest', priority: 'high' }]);
  });

  it('throws when there is no Title column', () => {
    expect(() => parseTasksCsv('Name,Priority\nSomething,high')).toThrow('Title');
  });

  it('returns an empty array for an empty input', () => {
    expect(parseTasksCsv('')).toEqual([]);
  });

  it('round-trips with tasksToCsv output', () => {
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

    const exported = tasksToCsv([
      task({ title: 'Say "hi", friend', priority: 'high', dueDate: '2026-08-06T00:00:00.000Z' }),
      task({ title: 'Simple quest', priority: 'low' }),
    ]);

    const reimported = parseTasksCsv(exported);
    expect(reimported[0].title).toBe('Say "hi", friend');
    expect(reimported[0].priority).toBe('high');
    expect(new Date(reimported[0].dueDate!).toISOString().slice(0, 10)).toBe('2026-08-06');
    expect(reimported[1]).toEqual({ title: 'Simple quest', priority: 'low' });
  });
});
