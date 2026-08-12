import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { useIsOnline } from '../lib/useIsOnline';
import { Panel } from '../components/Panel';
import { TaskRow } from '../components/TaskRow';
import { AddToTodayModal } from '../components/AddToTodayModal';
import { selectTodayTasks, computeTodaySuggestions } from '../lib/todaySuggestions';

const TODAY_LABEL = new Date().toLocaleDateString(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function TodayView() {
  const online = useIsOnline();
  const tasks = useStore((s) => s.tasks);
  const todayEntries = useStore((s) => s.todayEntries);
  const loadTodayEntries = useStore((s) => s.loadTodayEntries);
  const setTodayEntry = useStore((s) => s.setTodayEntry);
  const [showAddModal, setShowAddModal] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    loadTodayEntries().catch(() => {});
    // Only on mount — this page's own view of "today" doesn't need to react to
    // every unrelated task edit elsewhere in the app while it's open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const todayTasks = useMemo(() => selectTodayTasks(tasks, todayEntries), [tasks, todayEntries]);
  const suggestions = useMemo(() => computeTodaySuggestions(tasks, todayEntries), [tasks, todayEntries]);

  const handleDismissFromToday = async (taskId: string) => {
    setBusyId(taskId);
    try {
      await setTodayEntry(taskId, 'dismissed');
    } catch {
      // setTodayEntry already surfaces an error toast
    } finally {
      setBusyId(null);
    }
  };

  const handleSuggestion = async (taskId: string, status: 'added' | 'dismissed') => {
    setBusyId(taskId);
    try {
      await setTodayEntry(taskId, status);
    } catch {
      // setTodayEntry already surfaces an error toast
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-flicker-in">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan">
            Today's Tasks
          </h1>
          <p className="text-sm text-mist-dim mt-1">{TODAY_LABEL}</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          disabled={!online}
          title={online ? undefined : "You're offline — adding tasks needs a connection."}
          className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:cursor-default disabled:opacity-50 shrink-0"
        >
          + Add from any list
        </button>
      </div>

      <Panel className="mb-8">
        {todayTasks.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">
            Nothing planned for today yet. Add a task from any list, or accept a suggestion below.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-cyan-dim/10">
            {todayTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                subtitle={task.list?.project ? `${task.list.project.name} / ${task.list.name}` : undefined}
                trailingAction={
                  <button
                    onClick={() => handleDismissFromToday(task.id)}
                    disabled={!online || busyId === task.id}
                    title="Remove from today"
                    className="opacity-0 group-hover:opacity-100 text-mist-dim hover:text-danger text-xs px-1 cursor-pointer disabled:cursor-default shrink-0"
                  >
                    ✕
                  </button>
                }
              />
            ))}
          </div>
        )}
      </Panel>

      {suggestions.length > 0 && (
        <>
          <h2 className="font-display font-bold text-sm tracking-[0.2em] text-mist uppercase mb-4">
            Suggestions
          </h2>
          <Panel>
            <div className="flex flex-col divide-y divide-cyan-dim/10">
              {suggestions.map(({ task, reason }) => (
                <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-mist truncate">{task.title}</p>
                    <p className="font-mono text-[10px] text-cyan-dim truncate">
                      {reason}
                      {task.list?.project ? ` · ${task.list.project.name} / ${task.list.name}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleSuggestion(task.id, 'dismissed')}
                      disabled={!online || busyId === task.id}
                      title="Dismiss suggestion"
                      className="text-mist-dim hover:text-danger text-xs px-2 py-1 cursor-pointer disabled:cursor-default disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                    <button
                      onClick={() => handleSuggestion(task.id, 'added')}
                      disabled={!online || busyId === task.id}
                      title="Add to today"
                      className="hud-btn text-xs px-2.5 py-1 cursor-pointer disabled:cursor-default disabled:opacity-50"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </>
      )}

      {showAddModal && <AddToTodayModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
