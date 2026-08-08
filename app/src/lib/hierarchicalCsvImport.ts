import type { Priority } from '../types';
import { parseCsvRows } from './csvRows';

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];

export interface ParsedSubtaskRow {
  title: string;
  priority?: Priority;
  dueDate?: string;
  description?: string;
}

export interface ParsedQuestRow extends ParsedSubtaskRow {
  subtasks: ParsedSubtaskRow[];
}

export interface ParsedProjectListGroup {
  projectName: string;
  listName: string;
  quests: ParsedQuestRow[];
}

export interface HierarchicalImportSkip {
  rowNumber: number;
  reason: string;
}

export interface ParsedHierarchicalCsv {
  groups: ParsedProjectListGroup[];
  skips: HierarchicalImportSkip[];
}

function readOptionalFields(
  row: string[],
  priorityIdx: number,
  dueDateIdx: number,
  descriptionIdx: number
): Pick<ParsedSubtaskRow, 'priority' | 'dueDate' | 'description'> {
  const result: Pick<ParsedSubtaskRow, 'priority' | 'dueDate' | 'description'> = {};
  if (priorityIdx >= 0) {
    const raw = row[priorityIdx]?.trim().toLowerCase();
    if (PRIORITIES.includes(raw as Priority)) result.priority = raw as Priority;
  }
  if (dueDateIdx >= 0) {
    const raw = row[dueDateIdx]?.trim();
    if (raw && !Number.isNaN(Date.parse(raw))) result.dueDate = new Date(raw).toISOString();
  }
  if (descriptionIdx >= 0) {
    const raw = row[descriptionIdx]?.trim();
    if (raw) result.description = raw;
  }
  return result;
}

/**
 * Parses a CSV with Project/List/Quest/Task columns into a hierarchy of
 * Projects > Lists > Quests (top-level tasks) > Tasks (subtasks). Project,
 * List, and the "current quest" a Task row attaches to all use spreadsheet-
 * style fill-down: a blank cell inherits the last non-blank value seen while
 * walking rows top to bottom, so a hand-authored sheet doesn't need to repeat
 * those values on every row.
 *
 * A row with Quest filled starts a new top-level task; a row with only Task
 * filled attaches a subtask to the most recently defined Quest *within the
 * current Project+List*. Rows that can't be placed (e.g. a Task row before
 * any Quest has been defined for the current Project+List) are recorded as
 * skips rather than aborting the whole import — partially-useful beats
 * all-or-nothing, matching the existing flat importer's philosophy.
 */
export function parseHierarchicalCsv(text: string): ParsedHierarchicalCsv {
  const rows = parseCsvRows(text.trim());
  if (rows.length === 0) return { groups: [], skips: [] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const projectIdx = header.indexOf('project');
  const listIdx = header.indexOf('list');
  const questIdx = header.indexOf('quest');
  const taskIdx = header.indexOf('task');
  const priorityIdx = header.indexOf('priority');
  const dueDateIdx = header.indexOf('due date');
  const descriptionIdx = header.indexOf('description');

  if (projectIdx === -1 || listIdx === -1) {
    throw new Error('CSV must have "Project" and "List" columns');
  }
  if (questIdx === -1 && taskIdx === -1) {
    throw new Error('CSV must have a "Quest" or "Task" column');
  }

  const groups: ParsedProjectListGroup[] = [];
  const skips: HierarchicalImportSkip[] = [];

  let lastProject = '';
  let lastList = '';
  let currentQuest: ParsedQuestRow | null = null;
  let currentQuestScope: { project: string; list: string } | null = null;

  rows.slice(1).forEach((row, i) => {
    const rowNumber = i + 2; // 1-based, header is row 1 — matches what a user sees in a spreadsheet
    const projectCell = row[projectIdx]?.trim();
    const listCell = row[listIdx]?.trim();
    if (projectCell) lastProject = projectCell;
    if (listCell) lastList = listCell;

    const quest = questIdx >= 0 ? row[questIdx]?.trim() : '';
    const task = taskIdx >= 0 ? row[taskIdx]?.trim() : '';
    if (!quest && !task) return; // inert row — fill-down state already updated above

    if (!lastProject || !lastList) {
      skips.push({ rowNumber, reason: !lastProject ? 'no Project specified' : 'no List specified' });
      return;
    }

    const fields = readOptionalFields(row, priorityIdx, dueDateIdx, descriptionIdx);

    if (quest) {
      const questRow: ParsedQuestRow = { title: quest, ...fields, subtasks: [] };
      const last = groups[groups.length - 1];
      const group =
        last && last.projectName.toLowerCase() === lastProject.toLowerCase() && last.listName.toLowerCase() === lastList.toLowerCase()
          ? last
          : (() => {
              const g: ParsedProjectListGroup = { projectName: lastProject, listName: lastList, quests: [] };
              groups.push(g);
              return g;
            })();
      group.quests.push(questRow);
      currentQuest = questRow;
      currentQuestScope = { project: lastProject.toLowerCase(), list: lastList.toLowerCase() };
      return;
    }

    // Task filled, Quest blank
    const inScope =
      currentQuest !== null &&
      currentQuestScope !== null &&
      currentQuestScope.project === lastProject.toLowerCase() &&
      currentQuestScope.list === lastList.toLowerCase();
    if (!inScope) {
      skips.push({ rowNumber, reason: 'no Quest defined yet for this Project/List' });
      return;
    }
    (currentQuest as ParsedQuestRow).subtasks.push({ title: task, ...fields });
  });

  return { groups, skips };
}

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const TEMPLATE_ROWS = [
  ['Project', 'List', 'Quest', 'Task', 'Priority', 'Due Date', 'Description'],
  ['Clear the Red Gate', 'Main Quests', 'Scout the entrance', '', 'high', '2026-08-20', 'Recon before the raid'],
  ['', '', '', 'Check for traps', 'medium', '', ''],
  ['', '', '', 'Mark the safe path', 'low', '', ''],
  ['', '', 'Defeat the gatekeeper', '', 'high', '2026-08-22', ''],
];

/** Ready-to-download CSV text demonstrating the hierarchical import format's fill-down convention. */
export const HIERARCHICAL_CSV_TEMPLATE = TEMPLATE_ROWS.map((row) => row.map(escapeCsvField).join(',')).join('\n');
