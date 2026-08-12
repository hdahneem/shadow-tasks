import { useMemo, useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';
import { useIsOnline } from '../lib/useIsOnline';
import { selectTodayTasks } from '../lib/todaySuggestions';

/**
 * Lets the user manually pull any task from any list into Today's Tasks —
 * search across every non-done, non-archived task, excluding whatever's
 * already there (auto via startDate or previously added) so nothing shows
 * twice between this picker and the main list. An optional list filter narrows
 * the search to one list at a time; left on "All lists" (the default), every
 * list across every project is searched and each result shows its own
 * project/list so results from different lists aren't ambiguous.
 */
export function AddToTodayModal({ onClose }: { onClose: () => void }) {
  const online = useIsOnline();
  const tasks = useStore((s) => s.tasks);
  const todayEntries = useStore((s) => s.todayEntries);
  const setTodayEntry = useStore((s) => s.setTodayEntry);
  const lists = useStore((s) => s.lists);
  const projects = useStore((s) => s.projects);
  const [query, setQuery] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  const [addingId, setAddingId] = useState<string | null>(null);

  const alreadyInToday = useMemo(
    () => new Set(selectTodayTasks(tasks, todayEntries).map((t) => t.id)),
    [tasks, todayEntries]
  );

  // Grouped by project so the dropdown reads like the sidebar's own project
  // tree, rather than a flat, potentially-ambiguous list of list names.
  const listGroups = useMemo(() => {
    const projectNames = new Map(projects.map((p) => [p.id, p.name]));
    const groups = new Map<string, { projectName: string; lists: typeof lists }>();
    for (const list of lists) {
      const projectName = projectNames.get(list.projectId) ?? 'Other';
      if (!groups.has(list.projectId)) groups.set(list.projectId, { projectName, lists: [] });
      groups.get(list.projectId)!.lists.push(list);
    }
    return [...groups.entries()]
      .map(([projectId, group]) => ({ projectId, ...group }))
      .sort((a, b) => a.projectName.localeCompare(b.projectName));
  }, [lists, projects]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks
      .filter((t) => !t.done && !t.archivedAt && !alreadyInToday.has(t.id))
      .filter((t) => !selectedListId || t.listId === selectedListId)
      .filter((t) => !q || t.title.toLowerCase().includes(q))
      .slice(0, 50);
  }, [tasks, alreadyInToday, selectedListId, query]);

  const handleAdd = async (taskId: string) => {
    setAddingId(taskId);
    try {
      await setTodayEntry(taskId, 'added');
    } catch {
      // setTodayEntry already surfaces an error toast
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Modal title="Add to Today" onClose={onClose}>
      {!online ? (
        <p className="text-sm text-mist-dim py-4 text-center">
          You're offline — adding tasks to Today's list needs a connection.
        </p>
      ) : (
        <>
          <span className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">List</span>
          <select
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
            className="hud-input w-full mb-3 px-3 py-2 text-sm"
          >
            <option value="">All lists</option>
            {listGroups.map((group) => (
              <optgroup key={group.projectId} label={group.projectName}>
                {group.lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks by title…"
            className="hud-input w-full mb-4"
          />
          <div className="max-h-80 overflow-y-auto flex flex-col divide-y divide-cyan-dim/10 -mx-6">
            {candidates.length === 0 ? (
              <p className="text-sm text-mist-dim py-6 text-center">
                {query || selectedListId
                  ? 'No matching tasks.'
                  : 'Nothing left to add — everything is already on today\'s list.'}
              </p>
            ) : (
              candidates.map((task) => (
                <div key={task.id} className="flex items-center gap-3 px-6 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-mist truncate">{task.title}</p>
                    {/* Only shown while searching across all lists — with one list
                        selected, every result shares the same list, so repeating it
                        on every row would be noise rather than useful context. */}
                    {!selectedListId && task.list?.project && (
                      <p className="font-mono text-[10px] text-mist-dim truncate">
                        {task.list.project.name} / {task.list.name}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleAdd(task.id)}
                    disabled={addingId === task.id}
                    className="hud-btn text-xs px-2.5 py-1 cursor-pointer disabled:cursor-default disabled:opacity-50 shrink-0"
                  >
                    {addingId === task.id ? '…' : '+ Add'}
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
