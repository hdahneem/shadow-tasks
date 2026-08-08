import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appendOp, replayQueue, type PendingOp } from './offlineQueue';
import { tasksApi } from '../api/services';
import type { Task } from '../types';

vi.mock('../api/services', () => ({
  tasksApi: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

function task(overrides: Partial<Task>): Task {
  return {
    id: overrides.id ?? 't1',
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

describe('appendOp', () => {
  it('appends a create op as-is', () => {
    const op: PendingOp = { id: 'op1', kind: 'create', tempId: 'temp-1', listId: 'l1', payload: { title: 'A' }, createdAt: 1 };
    expect(appendOp([], op)).toEqual([op]);
  });

  it('merges a second update on the same task into the first', () => {
    const first: PendingOp = { id: 'op1', kind: 'update', taskId: 't1', patch: { title: 'A' }, createdAt: 1 };
    const second: PendingOp = { id: 'op2', kind: 'update', taskId: 't1', patch: { priority: 'high' }, createdAt: 2 };
    const queue = appendOp(appendOp([], first), second);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: 'update', taskId: 't1', patch: { title: 'A', priority: 'high' } });
  });

  it('a later update field overwrites an earlier one for the same key', () => {
    const first: PendingOp = { id: 'op1', kind: 'update', taskId: 't1', patch: { title: 'A' }, createdAt: 1 };
    const second: PendingOp = { id: 'op2', kind: 'update', taskId: 't1', patch: { title: 'B' }, createdAt: 2 };
    const queue = appendOp(appendOp([], first), second);
    expect(queue[0]).toMatchObject({ patch: { title: 'B' } });
  });

  it('collapses repeated toggleDone on the same task to the latest state', () => {
    const first: PendingOp = { id: 'op1', kind: 'toggleDone', taskId: 't1', done: true, createdAt: 1 };
    const second: PendingOp = { id: 'op2', kind: 'toggleDone', taskId: 't1', done: false, createdAt: 2 };
    const queue = appendOp(appendOp([], first), second);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({ kind: 'toggleDone', done: false });
  });

  it('a delete drops prior update/toggleDone ops for the same task and is appended', () => {
    const update: PendingOp = { id: 'op1', kind: 'update', taskId: 't1', patch: { title: 'A' }, createdAt: 1 };
    const toggle: PendingOp = { id: 'op2', kind: 'toggleDone', taskId: 't1', done: true, createdAt: 2 };
    const del: PendingOp = { id: 'op3', kind: 'delete', taskId: 't1', createdAt: 3 };
    const queue = appendOp(appendOp(appendOp([], update), toggle), del);
    expect(queue).toEqual([del]);
  });

  it('deleting a task that was created offline and never synced cancels both ops with no delete queued', () => {
    const create: PendingOp = { id: 'op1', kind: 'create', tempId: 'temp-1', listId: 'l1', payload: { title: 'A' }, createdAt: 1 };
    const del: PendingOp = { id: 'op2', kind: 'delete', taskId: 'temp-1', createdAt: 2 };
    const queue = appendOp(appendOp([], create), del);
    expect(queue).toEqual([]);
  });

  it('ops targeting different tasks do not interfere with each other', () => {
    const opA: PendingOp = { id: 'op1', kind: 'update', taskId: 't1', patch: { title: 'A' }, createdAt: 1 };
    const opB: PendingOp = { id: 'op2', kind: 'update', taskId: 't2', patch: { title: 'B' }, createdAt: 2 };
    const queue = appendOp(appendOp([], opA), opB);
    expect(queue).toHaveLength(2);
  });
});

describe('replayQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replays a create then rewrites a later update in the same batch to the real id', async () => {
    const realTask = task({ id: 'real-1', title: 'Buy milk' });
    vi.mocked(tasksApi.create).mockResolvedValue(realTask);
    vi.mocked(tasksApi.update).mockResolvedValue({ ...realTask, priority: 'high' });

    const queue: PendingOp[] = [
      { id: 'op1', kind: 'create', tempId: 'temp-1', listId: 'l1', payload: { title: 'Buy milk' }, createdAt: 1 },
      { id: 'op2', kind: 'update', taskId: 'temp-1', patch: { priority: 'high' }, createdAt: 2 },
    ];

    const synced: Array<[string, Task]> = [];
    await replayQueue(
      queue,
      (localId, t) => synced.push([localId, t]),
      () => {}
    );

    expect(tasksApi.create).toHaveBeenCalledWith('l1', { title: 'Buy milk' });
    expect(tasksApi.update).toHaveBeenCalledWith('real-1', { priority: 'high' });
    expect(synced[0][0]).toBe('temp-1');
    expect(synced[1][0]).toBe('real-1');
  });

  it('replays toggleDone as an update with just the done field', async () => {
    vi.mocked(tasksApi.update).mockResolvedValue(task({ id: 't1', done: true }));
    await replayQueue(
      [{ id: 'op1', kind: 'toggleDone', taskId: 't1', done: true, createdAt: 1 }],
      () => {},
      () => {}
    );
    expect(tasksApi.update).toHaveBeenCalledWith('t1', { done: true });
  });

  it('replays a delete and calls onTaskDeleted with the real id', async () => {
    vi.mocked(tasksApi.remove).mockResolvedValue(undefined);
    const deleted: string[] = [];
    await replayQueue(
      [{ id: 'op1', kind: 'delete', taskId: 't1', createdAt: 1 }],
      () => {},
      (id) => deleted.push(id)
    );
    expect(tasksApi.remove).toHaveBeenCalledWith('t1');
    expect(deleted).toEqual(['t1']);
  });

  it('rewrites a delete targeting a temp id created earlier in the same batch', async () => {
    const realTask = task({ id: 'real-2', title: 'Temp then delete' });
    vi.mocked(tasksApi.create).mockResolvedValue(realTask);
    vi.mocked(tasksApi.remove).mockResolvedValue(undefined);

    const deleted: string[] = [];
    await replayQueue(
      [
        { id: 'op1', kind: 'create', tempId: 'temp-2', listId: 'l1', payload: { title: 'Temp then delete' }, createdAt: 1 },
        { id: 'op2', kind: 'delete', taskId: 'temp-2', createdAt: 2 },
      ],
      () => {},
      (id) => deleted.push(id)
    );

    expect(tasksApi.remove).toHaveBeenCalledWith('real-2');
    expect(deleted).toEqual(['real-2']);
  });
});
