import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import type { Task } from '../types';

const PRIORITY_COLOR: Record<Task['priority'], string> = {
  low: '#4ade80',
  medium: '#facc15',
  high: '#f43f5e',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function TaskRow({
  task,
  subtitle,
  selectable = false,
  selected = false,
  onToggleSelect,
}: {
  task: Task;
  subtitle?: string;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}) {
  const toggleTask = useStore((s) => s.toggleTask);
  const deleteTask = useStore((s) => s.deleteTask);

  const overdue = task.dueDate && !task.done && new Date(task.dueDate) < new Date(new Date().toDateString());
  const subtaskCount = task._count?.subtasks ?? 0;

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 border-b border-cyan-dim/10 hover:bg-cyan-dim/5 transition-colors">
      {selectable && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="shrink-0 cursor-pointer"
          aria-label={`Select ${task.title}`}
        />
      )}
      <button
        onClick={() => toggleTask(task.id).catch(() => {})}
        className="shrink-0 w-5 h-5 border cursor-pointer flex items-center justify-center transition-all"
        style={{
          borderColor: task.done ? '#4ade80' : 'rgba(34,211,238,0.5)',
          background: task.done ? 'rgba(74,222,128,0.15)' : 'transparent',
          clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
        }}
        aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
      >
        {task.done && <span className="text-xs" style={{ color: '#4ade80' }}>✓</span>}
      </button>

      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: PRIORITY_COLOR[task.priority], boxShadow: `0 0 6px ${PRIORITY_COLOR[task.priority]}` }}
        title={`${task.priority} priority`}
      />

      <Link
        to={`/tasks/${task.id}`}
        className={`flex-1 min-w-0 text-left font-body text-sm ${task.done ? 'task-strike' : ''}`}
      >
        <span className="flex items-center gap-2 truncate">
          <span className="truncate">{task.title}</span>
          {subtaskCount > 0 && (
            <span className="shrink-0 font-mono text-[10px] text-mist-dim">{subtaskCount} sub</span>
          )}
        </span>
        {subtitle && <span className="block truncate font-mono text-[10px] text-mist-dim">{subtitle}</span>}
      </Link>

      {task.tags && task.tags.length > 0 && (
        <span className="hidden sm:flex items-center gap-1 shrink-0">
          {task.tags.slice(0, 2).map((t) => (
            <span
              key={t.id}
              className="px-1.5 py-0.5 text-[10px] rounded-sm border"
              style={{ borderColor: t.color, color: t.color }}
            >
              {t.name}
            </span>
          ))}
          {task.tags.length > 2 && (
            <span className="text-[10px] text-mist-dim">+{task.tags.length - 2}</span>
          )}
        </span>
      )}

      {task.assignees && task.assignees.length > 0 && (
        <span className="flex items-center -space-x-1.5 shrink-0" title={task.assignees.map((a) => a.name).join(', ')}>
          {task.assignees.slice(0, 3).map((a) => (
            <span
              key={a.id}
              className="w-5 h-5 rounded-full bg-cyan-dim/20 border border-void text-cyan-bright text-[9px] font-mono flex items-center justify-center uppercase"
            >
              {a.name.slice(0, 2)}
            </span>
          ))}
          {task.assignees.length > 3 && (
            <span className="w-5 h-5 rounded-full bg-cyan-dim/20 border border-void text-cyan-bright text-[9px] font-mono flex items-center justify-center">
              +{task.assignees.length - 3}
            </span>
          )}
        </span>
      )}

      {task.dueDate && (
        <span className={`font-mono text-[11px] shrink-0 ${overdue ? 'text-danger' : 'text-mist'}`}>
          {formatDate(task.dueDate)}
        </span>
      )}

      <button
        onClick={() => deleteTask(task.id).catch(() => {})}
        className="opacity-0 group-hover:opacity-100 text-mist-dim hover:text-danger text-xs px-1 cursor-pointer shrink-0"
        title="Delete task"
      >
        ✕
      </button>
    </div>
  );
}
