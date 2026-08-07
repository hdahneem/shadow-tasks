import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Panel } from '../components/Panel';
import {
  addMonths,
  dateKey,
  getMonthGrid,
  groupTasksByDate,
  isOverdue,
  isSameMonth,
  monthLabel,
  todayKey,
} from '../lib/calendar';
import type { Task } from '../types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRIORITY_COLOR: Record<Task['priority'], string> = {
  low: '#4ade80',
  medium: '#facc15',
  high: '#f43f5e',
};
const MAX_VISIBLE_PER_DAY = 3;

export function CalendarView() {
  const tasks = useStore((s) => s.tasks);
  const updateTask = useStore((s) => s.updateTask);

  const now = new Date();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const grid = useMemo(() => getMonthGrid(year, month), [year, month]);
  const grouped = useMemo(() => groupTasksByDate(tasks), [tasks]);
  const unscheduled = useMemo(
    () => tasks.filter((t) => !t.dueDate && !t.done),
    [tasks]
  );
  const today = todayKey();

  const goToday = () => {
    setYear(now.getUTCFullYear());
    setMonth(now.getUTCMonth());
  };
  const go = (delta: number) => {
    const next = addMonths(year, month, delta);
    setYear(next.year);
    setMonth(next.month);
  };

  const reschedule = (taskId: string, iso: string | null) => {
    updateTask(taskId, { dueDate: iso }).catch(() => {});
  };

  return (
    <div className="max-w-6xl mx-auto animate-flicker-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan">
          Calendar
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => go(-1)} className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
            ← Prev
          </button>
          <span className="font-display text-sm tracking-widest text-cyan-bright uppercase min-w-40 text-center">
            {monthLabel(year, month)}
          </span>
          <button onClick={() => go(1)} className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
            Next →
          </button>
          <button onClick={goToday} className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
            Today
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center font-display text-[11px] tracking-widest text-mist-dim uppercase py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((date) => {
              const key = dateKey(date);
              const dayTasks = grouped.get(key) ?? [];
              const inMonth = isSameMonth(date, year, month);
              const isToday = key === today;
              const isDragOver = dragOverKey === key;

              return (
                <div
                  key={key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOverKey(key);
                  }}
                  onDragLeave={() => setDragOverKey((k) => (k === key ? null : k))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOverKey(null);
                    const taskId = e.dataTransfer.getData('text/plain');
                    if (taskId) reschedule(taskId, `${key}T00:00:00.000Z`);
                  }}
                  className={`min-h-24 p-1.5 border text-left transition-colors ${
                    isToday ? 'border-cyan-bright bg-cyan-dim/10' : 'border-cyan-dim/15'
                  } ${isDragOver ? 'bg-cyan-dim/20 border-cyan-bright' : ''} ${!inMonth ? 'opacity-40' : ''}`}
                >
                  <div className={`font-mono text-[11px] mb-1 ${isToday ? 'text-cyan-bright' : 'text-mist-dim'}`}>
                    {date.getUTCDate()}
                  </div>
                  <div className="flex flex-col gap-1">
                    {dayTasks.slice(0, MAX_VISIBLE_PER_DAY).map((task) => (
                      <TaskChip
                        key={task.id}
                        task={task}
                        isDragging={draggingId === task.id}
                        onDragStart={() => setDraggingId(task.id)}
                        onDragEnd={() => setDraggingId(null)}
                      />
                    ))}
                    {dayTasks.length > MAX_VISIBLE_PER_DAY && (
                      <span className="text-[10px] text-mist-dim px-1">
                        +{dayTasks.length - MAX_VISIBLE_PER_DAY} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-full lg:w-64 shrink-0">
          <Panel className="p-4">
            <h2 className="font-display font-bold text-xs tracking-widest uppercase text-cyan-bright mb-3">
              Unscheduled
            </h2>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverKey('unscheduled');
              }}
              onDragLeave={() => setDragOverKey((k) => (k === 'unscheduled' ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverKey(null);
                const taskId = e.dataTransfer.getData('text/plain');
                if (taskId) reschedule(taskId, null);
              }}
              className={`flex flex-col gap-1.5 min-h-16 p-1 border transition-colors ${
                dragOverKey === 'unscheduled' ? 'bg-cyan-dim/20 border-cyan-bright' : 'border-transparent'
              }`}
            >
              {unscheduled.length === 0 ? (
                <p className="text-mist-dim text-xs">Nothing waiting to be scheduled.</p>
              ) : (
                unscheduled.map((task) => (
                  <TaskChip
                    key={task.id}
                    task={task}
                    isDragging={draggingId === task.id}
                    onDragStart={() => setDraggingId(task.id)}
                    onDragEnd={() => setDraggingId(null)}
                  />
                ))
              )}
            </div>
            <p className="text-[11px] text-mist-dim mt-3">Drag a quest onto a day to schedule it.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function TaskChip({
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
  const overdue = isOverdue(task);
  return (
    <Link
      to={`/tasks/${task.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', task.id);
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-1 px-1 py-0.5 text-[10px] sm:text-[11px] sm:px-1.5 sm:py-1 border cursor-grab active:cursor-grabbing overflow-hidden transition-opacity ${
        overdue ? 'border-danger/50 bg-danger/10 text-danger' : 'border-cyan-dim/25 bg-cyan-dim/5'
      } ${isDragging ? 'opacity-40' : 'opacity-100'} ${task.done ? 'task-strike' : ''}`}
      title={task.title}
    >
      <span
        className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: PRIORITY_COLOR[task.priority] }}
      />
      <span className="truncate">{task.title}</span>
    </Link>
  );
}
