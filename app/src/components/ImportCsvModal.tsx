import { useRef, useState } from 'react';
import { Modal } from './Modal';
import { ProgressBar } from './ProgressBar';
import { useStore } from '../store/useStore';
import { useIsOnline } from '../lib/useIsOnline';
import { errorMessage } from '../api/client';
import {
  parseHierarchicalCsv,
  HIERARCHICAL_CSV_TEMPLATE,
  type ParsedHierarchicalCsv,
} from '../lib/hierarchicalCsvImport';

interface ImportFailure {
  context: string;
  error: string;
}

interface ImportSummary {
  projectsCreated: number;
  projectsReused: number;
  listsCreated: number;
  listsReused: number;
  questsCreated: number;
  tasksCreated: number;
  failures: ImportFailure[];
}

type Phase = 'idle' | 'parsed' | 'importing' | 'done';

function countItems(parsed: ParsedHierarchicalCsv) {
  let quests = 0;
  let tasks = 0;
  for (const g of parsed.groups) {
    quests += g.quests.length;
    for (const q of g.quests) tasks += q.subtasks.length;
  }
  return { groups: parsed.groups.length, quests, tasks };
}

function downloadTemplate() {
  const blob = new Blob([HIERARCHICAL_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'shadow-tasks-import-template.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function ImportCsvModal({ onClose }: { onClose: () => void }) {
  const isOnline = useIsOnline();
  const currentWorkspaceId = useStore((s) => s.currentWorkspaceId);
  const addProject = useStore((s) => s.addProject);
  const addList = useStore((s) => s.addList);
  const createTask = useStore((s) => s.createTask);

  const [phase, setPhase] = useState<Phase>('idle');
  const [parsed, setParsed] = useState<ParsedHierarchicalCsv | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setParseError(null);
    const text = await file.text();
    try {
      const result = parseHierarchicalCsv(text);
      if (result.groups.length === 0) {
        setParseError('No quests found in that CSV.');
        return;
      }
      setParsed(result);
      setPhase('parsed');
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not parse that CSV.');
    }
  };

  const startImport = async () => {
    if (!parsed) return;
    const { groups: groupCount, quests, tasks } = countItems(parsed);
    const total = groupCount * 2 + quests + tasks; // project + list resolution, plus one step per quest/task
    let done = 0;
    setProgress({ done: 0, total });
    setPhase('importing');
    const bump = () => setProgress({ done: ++done, total });

    const result: ImportSummary = {
      projectsCreated: 0,
      projectsReused: 0,
      listsCreated: 0,
      listsReused: 0,
      questsCreated: 0,
      tasksCreated: 0,
      failures: [],
    };

    for (const group of parsed.groups) {
      let projectId: string;
      const existingProject = useStore
        .getState()
        .projects.find(
          (p) =>
            p.workspaceId === currentWorkspaceId &&
            p.name.trim().toLowerCase() === group.projectName.trim().toLowerCase()
        );
      if (existingProject) {
        projectId = existingProject.id;
        result.projectsReused++;
        bump();
      } else {
        try {
          projectId = await addProject(group.projectName, null, 'E');
          result.projectsCreated++;
          bump();
        } catch (err) {
          result.failures.push({ context: `Project "${group.projectName}"`, error: errorMessage(err) });
          continue;
        }
      }

      let listId: string;
      const existingList = useStore
        .getState()
        .lists.find(
          (l) => l.projectId === projectId && l.name.trim().toLowerCase() === group.listName.trim().toLowerCase()
        );
      if (existingList) {
        listId = existingList.id;
        result.listsReused++;
        bump();
      } else {
        try {
          listId = await addList(group.listName, projectId);
          result.listsCreated++;
          bump();
        } catch (err) {
          result.failures.push({
            context: `List "${group.listName}" in "${group.projectName}"`,
            error: errorMessage(err),
          });
          continue;
        }
      }

      for (const quest of group.quests) {
        let questId: string;
        try {
          const created = await createTask(listId, {
            title: quest.title,
            priority: quest.priority,
            dueDate: quest.dueDate,
            description: quest.description,
          });
          questId = created.id;
          result.questsCreated++;
          bump();
        } catch (err) {
          result.failures.push({ context: `Quest "${quest.title}"`, error: errorMessage(err) });
          bump();
          continue;
        }

        for (const subtask of quest.subtasks) {
          try {
            await createTask(listId, {
              title: subtask.title,
              priority: subtask.priority,
              dueDate: subtask.dueDate,
              description: subtask.description,
              parentTaskId: questId,
            });
            result.tasksCreated++;
          } catch (err) {
            result.failures.push({
              context: `Task "${subtask.title}" under "${quest.title}"`,
              error: errorMessage(err),
            });
          }
          bump();
        }
      }
    }

    setSummary(result);
    setPhase('done');
  };

  const counts = parsed ? countItems(parsed) : null;

  return (
    <Modal title="Import from CSV" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {!isOnline && (
          <p className="text-danger text-sm">You're offline — bulk import needs a connection.</p>
        )}

        {phase === 'idle' && (
          <>
            <p className="text-mist text-sm">
              Upload a CSV with <span className="text-cyan-bright">Project</span>,{' '}
              <span className="text-cyan-bright">List</span>, <span className="text-cyan-bright">Quest</span>, and{' '}
              <span className="text-cyan-bright">Task</span> columns to bulk-create your hierarchy — matching
              Project/List names are reused, everything else is created fresh.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) handleFile(file);
              }}
            />
            {parseError && <p className="text-danger text-sm">{parseError}</p>}
            <div className="flex gap-3">
              <button
                type="button"
                disabled={!isOnline}
                onClick={() => fileInputRef.current?.click()}
                className="hud-btn hud-btn-solid px-4 py-2 text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Choose CSV File
              </button>
              <button
                type="button"
                onClick={downloadTemplate}
                className="hud-btn px-4 py-2 text-sm cursor-pointer"
              >
                Download Template
              </button>
            </div>
          </>
        )}

        {phase === 'parsed' && parsed && counts && (
          <>
            <p className="text-mist text-sm">
              Found <span className="text-cyan-bright">{counts.groups}</span> project/list group
              {counts.groups === 1 ? '' : 's'}, <span className="text-cyan-bright">{counts.quests}</span> quest
              {counts.quests === 1 ? '' : 's'}, and <span className="text-cyan-bright">{counts.tasks}</span> task
              {counts.tasks === 1 ? '' : 's'}.
            </p>
            {parsed.skips.length > 0 && (
              <div className="text-xs text-mist-dim">
                <p className="mb-1">{parsed.skips.length} row(s) skipped:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {parsed.skips.map((s) => (
                    <li key={s.rowNumber}>
                      Row {s.rowNumber}: {s.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={startImport}
                className="hud-btn hud-btn-solid px-4 py-2 text-sm cursor-pointer"
              >
                Start Import
              </button>
              <button
                type="button"
                onClick={() => {
                  setParsed(null);
                  setPhase('idle');
                }}
                className="hud-btn px-4 py-2 text-sm cursor-pointer"
              >
                Choose Different File
              </button>
            </div>
          </>
        )}

        {phase === 'importing' && (
          <ProgressBar value={progress.done} max={progress.total} label="Importing…" />
        )}

        {phase === 'done' && summary && (
          <>
            <p className="text-cyan-bright text-sm">
              {summary.projectsCreated} project{summary.projectsCreated === 1 ? '' : 's'} created
              {summary.projectsReused > 0 ? `, ${summary.projectsReused} reused` : ''} ·{' '}
              {summary.listsCreated} list{summary.listsCreated === 1 ? '' : 's'} created
              {summary.listsReused > 0 ? `, ${summary.listsReused} reused` : ''} ·{' '}
              {summary.questsCreated} quest{summary.questsCreated === 1 ? '' : 's'} created ·{' '}
              {summary.tasksCreated} task{summary.tasksCreated === 1 ? '' : 's'} created
            </p>
            {(parsed?.skips.length || summary.failures.length > 0) && (
              <div className="text-xs text-danger">
                <p className="mb-1">
                  {(parsed?.skips.length ?? 0) + summary.failures.length} row(s) need attention:
                </p>
                <ul className="list-disc list-inside space-y-0.5">
                  {parsed?.skips.map((s) => (
                    <li key={`skip-${s.rowNumber}`}>
                      Row {s.rowNumber}: {s.reason}
                    </li>
                  ))}
                  {summary.failures.map((f, i) => (
                    <li key={`fail-${i}`}>
                      {f.context}: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="hud-btn hud-btn-solid px-4 py-2 text-sm cursor-pointer self-start"
            >
              Close
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
