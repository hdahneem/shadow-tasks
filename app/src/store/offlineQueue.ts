import type { Task } from '../types';
import { tasksApi, type TaskCreateInput, type TaskUpdateInput } from '../api/services';

export type PendingOp =
  | { id: string; kind: 'create'; tempId: string; listId: string; payload: TaskCreateInput; createdAt: number }
  | { id: string; kind: 'update'; taskId: string; patch: TaskUpdateInput; createdAt: number }
  | { id: string; kind: 'toggleDone'; taskId: string; done: boolean; createdAt: number }
  | { id: string; kind: 'delete'; taskId: string; createdAt: number };

export function targetId(op: PendingOp): string {
  return op.kind === 'create' ? op.tempId : op.taskId;
}

/**
 * Appends a new op to the queue, collapsing it against whatever's already queued
 * for the same task so replay stays cheap and never fires redundant requests:
 *   - update + update on the same task merges into one patch
 *   - toggleDone + toggleDone collapses to the latest requested state
 *   - delete drops every prior op for that task; if one of those was the `create`
 *     for that exact task (never synced), the delete is dropped too — the server
 *     never saw the task, so there's nothing to tell it about.
 */
export function appendOp(queue: PendingOp[], newOp: PendingOp): PendingOp[] {
  if (newOp.kind === 'delete') {
    const createForThis = queue.find((op) => op.kind === 'create' && op.tempId === newOp.taskId);
    const withoutPriorOpsForTarget = queue.filter((op) => targetId(op) !== newOp.taskId);
    return createForThis ? withoutPriorOpsForTarget : [...withoutPriorOpsForTarget, newOp];
  }

  if (newOp.kind === 'update') {
    const idx = queue.findIndex((op) => op.kind === 'update' && targetId(op) === newOp.taskId);
    if (idx === -1) return [...queue, newOp];
    const existing = queue[idx] as Extract<PendingOp, { kind: 'update' }>;
    const merged: PendingOp = { ...newOp, patch: { ...existing.patch, ...newOp.patch } };
    return queue.map((op, i) => (i === idx ? merged : op));
  }

  if (newOp.kind === 'toggleDone') {
    const idx = queue.findIndex((op) => op.kind === 'toggleDone' && targetId(op) === newOp.taskId);
    if (idx === -1) return [...queue, newOp];
    return queue.map((op, i) => (i === idx ? newOp : op));
  }

  return [...queue, newOp]; // create
}

/**
 * Replays queued ops against the real API in order, maintaining a tempId -> real
 * id map so any later op in the same batch that targets a task created earlier in
 * this same batch gets rewritten to the real id before it fires.
 */
export async function replayQueue(
  queue: PendingOp[],
  onTaskSynced: (localId: string, task: Task) => void,
  onTaskDeleted: (id: string) => void
): Promise<void> {
  const idMap = new Map<string, string>();

  for (const op of queue) {
    if (op.kind === 'create') {
      const real = await tasksApi.create(op.listId, op.payload);
      idMap.set(op.tempId, real.id);
      onTaskSynced(op.tempId, real);
      continue;
    }

    const realId = idMap.get(op.taskId) ?? op.taskId;
    if (op.kind === 'update') {
      const updated = await tasksApi.update(realId, op.patch);
      onTaskSynced(realId, updated);
    } else if (op.kind === 'toggleDone') {
      const updated = await tasksApi.update(realId, { done: op.done });
      onTaskSynced(realId, updated);
    } else if (op.kind === 'delete') {
      await tasksApi.remove(realId);
      onTaskDeleted(realId);
    }
  }
}
