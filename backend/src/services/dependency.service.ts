import { prisma } from '../lib/prisma.js';

/**
 * Adding a predecessor -> successor edge would create a cycle if successor
 * can already reach predecessor by following existing predecessor -> successor
 * edges forward (i.e. predecessor is already a downstream descendant of successor).
 */
export async function wouldCreateDependencyCycle(predecessorId: string, successorId: string): Promise<boolean> {
  if (predecessorId === successorId) return true;

  const visited = new Set<string>();
  const queue = [successorId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === predecessorId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const outgoing = await prisma.taskDependency.findMany({
      where: { predecessorId: current },
      select: { successorId: true },
    });
    queue.push(...outgoing.map((edge) => edge.successorId));
  }
  return false;
}

/**
 * Predecessors that must reach the relevant state before `taskId` can be marked done.
 * Finish-to-Start and Finish-to-Finish both require the predecessor to be *finished*
 * before this task can finish; Start-to-Start only constrains starting, so it never
 * blocks completion.
 */
export async function getUnresolvedPredecessors(taskId: string) {
  const edges = await prisma.taskDependency.findMany({
    where: { successorId: taskId, type: { in: ['finish_to_start', 'finish_to_finish'] } },
    include: { predecessor: { select: { id: true, title: true, done: true } } },
  });
  return edges.filter((edge) => !edge.predecessor.done).map((edge) => edge.predecessor);
}
