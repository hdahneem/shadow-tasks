import type { Task } from '../types';

const CSV_HEADER = ['Title', 'Project', 'List', 'Status', 'Priority', 'Due Date', 'Assignees'];

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}

/** Renders tasks (in the order given) as a CSV string, ready to hand to a Blob for download. */
export function tasksToCsv(tasks: Task[]): string {
  const rows = tasks.map((t) =>
    toCsvRow([
      t.title,
      t.list?.project?.name ?? '',
      t.list?.name ?? '',
      t.done ? 'Done' : 'Open',
      t.priority,
      t.dueDate ? new Date(t.dueDate).toISOString().slice(0, 10) : '',
      (t.assignees ?? []).map((a) => a.name).join('; '),
    ])
  );
  return [toCsvRow(CSV_HEADER), ...rows].join('\n');
}
