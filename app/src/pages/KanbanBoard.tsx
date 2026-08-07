import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { statusesApi, tasksApi } from '../api/services';
import type { Status, Task } from '../types';

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  low: '#4ade80',
  medium: '#facc15',
  high: '#f43f5e',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function KanbanBoard() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));

  const [statuses, setStatuses] = useState<Status[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId) return;
    const [s, t] = await Promise.all([
      statusesApi.listForProject(projectId),
      tasksApi.listForProject(projectId),
    ]);
    setStatuses(s);
    setTasks(t);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

  const columns = useMemo(() => {
    const byStatus = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = t.statusId ?? 'unsorted';
      if (!byStatus.has(key)) byStatus.set(key, []);
      byStatus.get(key)!.push(t);
    }
    return { byStatus, unsorted: byStatus.get('unsorted') ?? [] };
  }, [tasks]);

  const moveTask = async (taskId: string, statusId: string) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.statusId === statusId) return;
    // optimistic move so the drop feels instant, then reconcile with the server
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, statusId } : t)));
    try {
      // routes through the store so XP/level stays in sync when a drag completes a quest
      await useStore.getState().setTaskStatus(taskId, statusId);
    } catch {
      // error toast already shown by the store
    } finally {
      refetch();
      useStore.getState().refreshTasks().catch(() => {});
    }
  };

  if (!project) {
    return (
      <div className="max-w-3xl mx-auto animate-flicker-in">
        <p className="text-mist-dim text-sm">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="animate-flicker-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-xs text-mist hover:text-cyan-bright cursor-pointer">
            ← Back
          </button>
          <h1 className="font-display font-bold text-xl uppercase tracking-wide text-glow-cyan">
            {project.name} — Board
          </h1>
        </div>
      </div>

      {loading ? (
        <p className="text-mist-dim text-sm">Loading board…</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {columns.unsorted.length > 0 && (
            <Column
              title="Unsorted"
              color="#465066"
              tasks={columns.unsorted}
              isDragOver={dragOverStatusId === 'unsorted'}
              onDragOver={() => setDragOverStatusId('unsorted')}
              onDragLeave={() => setDragOverStatusId(null)}
              onDrop={() => {
                setDragOverStatusId(null);
              }}
              droppable={false}
              draggingTaskId={draggingTaskId}
              setDraggingTaskId={setDraggingTaskId}
            />
          )}
          {statuses.map((status) => (
            <Column
              key={status.id}
              title={status.name}
              color={status.color}
              tasks={columns.byStatus.get(status.id) ?? []}
              isDragOver={dragOverStatusId === status.id}
              onDragOver={() => setDragOverStatusId(status.id)}
              onDragLeave={() => setDragOverStatusId(null)}
              onDrop={(taskId) => {
                setDragOverStatusId(null);
                moveTask(taskId, status.id);
              }}
              droppable
              draggingTaskId={draggingTaskId}
              setDraggingTaskId={setDraggingTaskId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Column({
  title,
  color,
  tasks,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  droppable,
  draggingTaskId,
  setDraggingTaskId,
}: {
  title: string;
  color: string;
  tasks: Task[];
  isDragOver: boolean;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (taskId: string) => void;
  droppable: boolean;
  draggingTaskId: string | null;
  setDraggingTaskId: (id: string | null) => void;
}) {
  return (
    <div
      className="w-72 shrink-0 flex flex-col"
      onDragOver={(e) => {
        if (!droppable) return;
        e.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        if (!droppable) return;
        e.preventDefault();
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId) onDrop(taskId);
      }}
    >
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
        <h2 className="font-display font-bold text-xs tracking-widest uppercase text-mist truncate">{title}</h2>
        <span className="font-mono text-[11px] text-mist-dim ml-auto">{tasks.length}</span>
      </div>
      <div
        className={`flex-1 flex flex-col gap-2 p-2 min-h-24 border transition-colors ${
          isDragOver ? 'border-cyan-bright bg-cyan-dim/10' : 'border-cyan-dim/15'
        }`}
      >
        {tasks.length === 0 ? (
          <p className="text-mist-dim text-xs text-center py-6">No quests here.</p>
        ) : (
          tasks.map((task) => (
            <Card
              key={task.id}
              task={task}
              isDragging={draggingTaskId === task.id}
              onDragStart={() => setDraggingTaskId(task.id)}
              onDragEnd={() => setDraggingTaskId(null)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function Card({
  task,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  task: Task;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`hud-panel p-3 cursor-grab active:cursor-grabbing transition-opacity ${
        isDragging ? 'opacity-40' : 'opacity-100'
      }`}
    >
      <Link to={`/tasks/${task.id}`} className={`block text-sm mb-1.5 ${task.done ? 'task-strike' : ''}`}>
        {task.title}
      </Link>
      <div className="flex items-center gap-2 text-[11px] text-mist-dim">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ background: PRIORITY_COLOR[task.priority], boxShadow: `0 0 4px ${PRIORITY_COLOR[task.priority]}` }}
        />
        {task.list?.name && <span className="truncate">{task.list.name}</span>}
        {(task._count?.subtasks ?? 0) > 0 && <span className="shrink-0">· {task._count!.subtasks} sub</span>}
        {task.dueDate && <span className="ml-auto shrink-0 font-mono">{formatDate(task.dueDate)}</span>}
      </div>
    </div>
  );
}
