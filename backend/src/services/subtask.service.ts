import { prisma } from '../lib/prisma.js';

interface MinimalTask {
  id: string;
  title: string;
  done: boolean;
  priority: string;
  dueDate: Date | null;
  position: number;
  parentTaskId: string | null;
}

export interface SubtaskNode extends MinimalTask {
  progress: number;
  children: SubtaskNode[];
}

/**
 * Loads the full descendant subtree of a task in one query (Postgres recursive CTE),
 * then assembles it into a nested tree with bottom-up progress rollup.
 * A leaf's progress is 100/0 from its own `done` flag; a branch's progress is the
 * average of its direct children's progress, so completion rolls up through any depth.
 */
export async function buildSubtaskTree(rootTaskId: string): Promise<SubtaskNode[]> {
  const rows = await prisma.$queryRaw<MinimalTask[]>`
    WITH RECURSIVE descendants AS (
      SELECT id, title, done, priority, "dueDate", position, "parentTaskId"
      FROM "Task"
      WHERE "parentTaskId" = ${rootTaskId} AND "archivedAt" IS NULL
      UNION ALL
      SELECT t.id, t.title, t.done, t.priority, t."dueDate", t.position, t."parentTaskId"
      FROM "Task" t
      INNER JOIN descendants d ON t."parentTaskId" = d.id
      WHERE t."archivedAt" IS NULL
    )
    SELECT * FROM descendants ORDER BY position ASC;
  `;

  const byParent = new Map<string, MinimalTask[]>();
  for (const row of rows) {
    const key = row.parentTaskId ?? '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(row);
  }

  function assemble(parentId: string): SubtaskNode[] {
    const children = byParent.get(parentId) ?? [];
    return children.map((child) => {
      const grandchildren = assemble(child.id);
      const progress =
        grandchildren.length > 0
          ? Math.round(grandchildren.reduce((sum, g) => sum + g.progress, 0) / grandchildren.length)
          : child.done
            ? 100
            : 0;
      return { ...child, progress, children: grandchildren };
    });
  }

  return assemble(rootTaskId);
}

export async function computeTaskProgress(taskId: string): Promise<number> {
  const tree = await buildSubtaskTree(taskId);
  if (tree.length === 0) {
    const task = await prisma.task.findUnique({ where: { id: taskId }, select: { done: true } });
    return task?.done ? 100 : 0;
  }
  return Math.round(tree.reduce((sum, n) => sum + n.progress, 0) / tree.length);
}

/** Prevents a subtask being reparented into its own descendant, which would create a cycle. */
export async function wouldCreateCycle(taskId: string, newParentId: string): Promise<boolean> {
  if (taskId === newParentId) return true;
  let current: string | null = newParentId;
  const visited = new Set<string>();
  while (current) {
    if (current === taskId) return true;
    if (visited.has(current)) break;
    visited.add(current);
    const parent: { parentTaskId: string | null } | null = await prisma.task.findUnique({
      where: { id: current },
      select: { parentTaskId: true },
    });
    current = parent?.parentTaskId ?? null;
  }
  return false;
}
