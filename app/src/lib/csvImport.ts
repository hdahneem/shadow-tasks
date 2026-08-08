import type { Priority } from '../types';
import { parseCsvRows } from './csvRows';

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

export interface ImportedTaskRow {
  title: string;
  priority?: Priority;
  dueDate?: string;
}

/**
 * Parses a CSV (as exported by tasksToCsv, or any sheet with a "Title" column)
 * into task-creation inputs. "Priority" must be low/medium/high (case-insensitive)
 * to be recognized; "Due Date" must parse as a valid date. Unrecognized values in
 * either column are silently dropped rather than rejecting the whole row, since a
 * partially-useful import beats an all-or-nothing failure on one bad cell.
 */
export function parseTasksCsv(text: string): ImportedTaskRow[] {
  const rows = parseCsvRows(text.trim());
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const titleIdx = header.indexOf('title');
  if (titleIdx === -1) {
    throw new Error('CSV must have a "Title" column');
  }
  const priorityIdx = header.indexOf('priority');
  const dueDateIdx = header.indexOf('due date');

  return rows
    .slice(1)
    .map((row): ImportedTaskRow | null => {
      const title = row[titleIdx]?.trim() ?? '';
      if (!title) return null;

      const result: ImportedTaskRow = { title };

      if (priorityIdx >= 0) {
        const raw = row[priorityIdx]?.trim().toLowerCase();
        if (PRIORITIES.includes(raw as Priority)) result.priority = raw as Priority;
      }
      if (dueDateIdx >= 0) {
        const raw = row[dueDateIdx]?.trim();
        if (raw && !Number.isNaN(Date.parse(raw))) result.dueDate = new Date(raw).toISOString();
      }
      return result;
    })
    .filter((r): r is ImportedTaskRow => r !== null);
}
