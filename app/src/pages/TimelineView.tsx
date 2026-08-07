import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Panel } from '../components/Panel';
import { tasksApi } from '../api/services';
import { computeTimelineRange, computeTaskBar } from '../lib/timeline';
import { dateKey, todayKey } from '../lib/calendar';
import type { Task } from '../types';

const DAY_COL = 32;
const LABEL_COL = 200;

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  low: '#4ade80',
  medium: '#facc15',
  high: '#f43f5e',
};

function formatDay(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TimelineView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const allLists = useStore((s) => s.lists);
  const lists = useMemo(() => allLists.filter((l) => l.projectId === projectId), [allLists, projectId]);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!projectId) return;
    const t = await tasksApi.listForProject(projectId);
    setTasks(t);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

  const range = useMemo(() => computeTimelineRange(tasks), [tasks]);
  const today = todayKey();

  const rows = useMemo(() => {
    return lists.map((list) => ({
      list,
      tasks: tasks
        .filter((t) => t.listId === list.id)
        .map((t) => ({ task: t, bar: computeTaskBar(t, range) }))
        .filter((r) => r.bar !== null) as { task: Task; bar: NonNullable<ReturnType<typeof computeTaskBar>> }[],
    }));
  }, [lists, tasks, range]);

  const unscheduled = tasks.filter((t) => !t.startDate && !t.dueDate);

  if (!project) {
    return (
      <div className="max-w-3xl mx-auto animate-flicker-in">
        <p className="text-mist-dim text-sm">Project not found.</p>
      </div>
    );
  }

  const gridTemplateColumns = `${LABEL_COL}px repeat(${range.days.length}, ${DAY_COL}px)`;

  return (
    <div className="max-w-6xl mx-auto animate-flicker-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan">Timeline</h1>
          <p className="text-sm text-mist-dim mt-1">{project.name}</p>
        </div>
        <button onClick={() => navigate(`/projects/${project.id}`)} className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
          ← Back to Quests
        </button>
      </div>

      {loading ? (
        <p className="text-mist-dim text-sm">Loading…</p>
      ) : (
        <Panel className="p-4 overflow-x-auto">
          <div style={{ minWidth: LABEL_COL + range.days.length * DAY_COL }}>
            <div className="grid" style={{ gridTemplateColumns }}>
              <div />
              {range.days.map((d) => {
                const key = dateKey(d);
                return (
                  <div
                    key={key}
                    className={`text-center font-mono text-[9px] pb-1.5 border-b ${
                      key === today ? 'text-cyan-bright border-cyan-bright/50' : 'text-mist-dim border-cyan-dim/15'
                    }`}
                  >
                    {formatDay(d)}
                  </div>
                );
              })}
            </div>

            {rows.map(({ list, tasks: listTasks }) =>
              listTasks.length === 0 ? null : (
                <div key={list.id}>
                  <div className="text-[10px] uppercase tracking-widest text-mist-dim mt-3 mb-1">{list.name}</div>
                  {listTasks.map(({ task, bar }) => (
                    <div
                      key={task.id}
                      className="grid items-center h-8"
                      style={{ gridTemplateColumns }}
                    >
                      <button
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        className={`text-left text-xs truncate pr-2 cursor-pointer hover:text-cyan-bright ${
                          task.done ? 'text-mist-dim line-through' : 'text-mist'
                        }`}
                        title={task.title}
                      >
                        {task.title}
                      </button>
                      <div
                        className="h-4 rounded-sm cursor-pointer"
                        style={{
                          gridColumn: `${bar.startOffset + 2} / span ${bar.span}`,
                          backgroundColor: task.done ? '#4b5563' : PRIORITY_COLOR[task.priority],
                          opacity: task.done ? 0.5 : 0.85,
                        }}
                        title={task.title}
                        onClick={() => navigate(`/tasks/${task.id}`)}
                      />
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </Panel>
      )}

      {unscheduled.length > 0 && (
        <div className="mt-6">
          <h2 className="font-display font-bold text-sm tracking-[0.2em] text-mist uppercase mb-3">
            Unscheduled
          </h2>
          <Panel className="p-2">
            {unscheduled.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(`/tasks/${t.id}`)}
                className={`w-full text-left px-2 py-1.5 text-sm cursor-pointer hover:text-cyan-bright ${
                  t.done ? 'text-mist-dim line-through' : 'text-mist'
                }`}
              >
                {t.title}
              </button>
            ))}
          </Panel>
        </div>
      )}
    </div>
  );
}
