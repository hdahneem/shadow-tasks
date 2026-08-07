import { prisma } from '../lib/prisma.js';
import { buildSubtaskTree } from './subtask.service.js';
import { getDefaultStatusId } from './status.service.js';

export interface ChecklistNode {
  title: string;
  priority: 'low' | 'medium' | 'high';
  children: ChecklistNode[];
}

function toChecklist(nodes: { title: string; priority: string; children: unknown[] }[]): ChecklistNode[] {
  return nodes.map((n) => ({
    title: n.title,
    priority: n.priority as ChecklistNode['priority'],
    children: toChecklist(n.children as typeof nodes),
  }));
}

/** Snapshots a task's subtask tree into a plain title/priority checklist, dropping ids, done state, and dates. */
export async function snapshotChecklist(rootTaskId: string): Promise<ChecklistNode[]> {
  const tree = await buildSubtaskTree(rootTaskId);
  return toChecklist(tree);
}

/** Recreates a checklist snapshot as real subtasks under a newly-created task. */
export async function createSubtasksFromChecklist(
  listId: string,
  parentTaskId: string,
  projectId: string,
  nodes: ChecklistNode[]
): Promise<void> {
  const defaultStatusId = await getDefaultStatusId(projectId, false);
  let position = 1;
  for (const node of nodes) {
    const child = await prisma.task.create({
      data: {
        listId,
        parentTaskId,
        title: node.title,
        priority: node.priority,
        statusId: defaultStatusId,
        position: position++,
      },
    });
    if (node.children.length > 0) {
      await createSubtasksFromChecklist(listId, child.id, projectId, node.children);
    }
  }
}
