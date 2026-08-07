import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { publicApi } from '../api/services';
import { ApiError } from '../api/client';
import type { PublicTask, SubtaskNode } from '../types';

function SubtaskList({ nodes }: { nodes: SubtaskNode[] }) {
  if (nodes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5 pl-4">
      {nodes.map((n) => (
        <li key={n.id} className="text-sm">
          <span className={n.done ? 'task-strike text-mist-dim' : 'text-mist'}>
            {n.done ? '✓' : '○'} {n.title}
          </span>
          {n.children.length > 0 && <SubtaskList nodes={n.children} />}
        </li>
      ))}
    </ul>
  );
}

export function PublicTaskView() {
  const { token } = useParams<{ token: string }>();
  const [task, setTask] = useState<PublicTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!token) return;
    publicApi
      .getTask(token)
      .then(setTask)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else throw err;
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="hud-grid min-h-screen flex items-center justify-center">
        <p className="text-mist-dim text-sm">Loading…</p>
      </div>
    );
  }

  if (notFound || !task) {
    return (
      <div className="hud-grid min-h-screen flex items-center justify-center p-4">
        <p className="text-mist-dim text-sm">This link is invalid or has been revoked.</p>
      </div>
    );
  }

  return (
    <div className="hud-grid min-h-screen p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2 h-2 bg-cyan rounded-full shadow-[0_0_8px_2px_rgba(34,211,238,0.8)]" />
          <span className="font-display font-bold tracking-[0.2em] text-xs text-glow-cyan uppercase">
            Shadow Tasks — Shared Quest
          </span>
        </div>

        <Panel className="p-6">
          <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan mb-2">
            {task.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-xs text-mist-dim mb-4">
            <span>
              {task.projectName} / {task.listName}
            </span>
            {task.status && <span style={{ color: task.status.color }}>{task.status.name}</span>}
            <span className="capitalize">{task.priority} priority</span>
            {task.dueDate && <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>}
          </div>

          <div className="mb-1.5 h-1.5 bg-cyan-dim/10 overflow-hidden rounded-full">
            <div className="h-full bg-cyan" style={{ width: `${task.progress}%` }} />
          </div>
          <p className="text-[10px] text-mist-dim mb-4">{task.progress}% complete</p>

          {task.description && (
            <div className="rich-text-content mb-6" dangerouslySetInnerHTML={{ __html: task.description }} />
          )}

          {task.subtasks.length > 0 && (
            <div className="mb-6">
              <h2 className="font-display text-xs uppercase tracking-widest text-mist mb-2">Subtasks</h2>
              <SubtaskList nodes={task.subtasks} />
            </div>
          )}

          {task.comments.length > 0 && (
            <div>
              <h2 className="font-display text-xs uppercase tracking-widest text-mist mb-2">Comments</h2>
              <div className="flex flex-col gap-3">
                {task.comments.map((c, i) => (
                  <div key={i} className="text-sm">
                    <span className="text-mist font-medium">{c.authorName}</span>
                    <span className="text-mist-dim text-xs ml-2">{new Date(c.createdAt).toLocaleString()}</span>
                    <p className="whitespace-pre-wrap text-mist">{c.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>

        <p className="text-center text-[10px] text-mist-dim mt-4">Read-only shared view · Powered by Shadow Tasks</p>
      </div>
    </div>
  );
}
