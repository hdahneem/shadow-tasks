import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { tasksApi } from '../api/services';
import type { Task } from '../types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const PAGE_SIZE = 25;

export function ArchivedQuestsView() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const load = (pageNum: number) =>
    tasksApi
      .listAllPaged({ archived: true, includeDone: true, page: pageNum, pageSize: PAGE_SIZE })
      .then((res) => {
        setTasks((prev) => (pageNum === 1 ? res.tasks : [...prev, ...res.tasks]));
        setTotal(res.total);
        setPage(pageNum);
      });

  const refetch = () => {
    setLoading(true);
    load(1).finally(() => setLoading(false));
  };

  const loadMore = () => {
    setLoadingMore(true);
    load(page + 1).finally(() => setLoadingMore(false));
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const restore = async (id: string) => {
    await tasksApi.restore(id);
    refetch();
  };

  const deleteForever = async (id: string, title: string) => {
    if (!confirm(`Permanently delete "${title}"? This cannot be undone.`)) return;
    await tasksApi.remove(id);
    refetch();
  };

  return (
    <div className="max-w-3xl mx-auto animate-flicker-in">
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan">
          Archived Quests
        </h1>
        <p className="text-sm text-mist-dim mt-1">
          Quests you've archived. Restore one to bring it back, or delete it permanently.
        </p>
      </div>

      <Panel>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">No archived quests.</p>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 px-3 py-2.5 border-b border-cyan-dim/10 hover:bg-cyan-dim/5 transition-colors"
            >
              <Link to={`/tasks/${t.id}`} className="flex-1 min-w-0 font-body text-sm text-mist hover:underline">
                <span className="truncate block">{t.title}</span>
                {t.list?.project && (
                  <span className="block truncate font-mono text-[10px] text-mist-dim">
                    {t.list.project.name} / {t.list.name}
                  </span>
                )}
              </Link>
              {t.archivedAt && (
                <span className="font-mono text-[11px] text-mist-dim shrink-0">
                  Archived {formatDate(t.archivedAt)}
                </span>
              )}
              <button
                onClick={() => restore(t.id)}
                className="hud-btn text-xs px-2.5 py-1 cursor-pointer shrink-0"
              >
                Restore
              </button>
              <button
                onClick={() => deleteForever(t.id, t.title)}
                className="text-mist-dim hover:text-danger text-xs px-1 cursor-pointer shrink-0"
                title="Delete permanently"
              >
                Delete
              </button>
            </div>
          ))
        )}
      </Panel>

      {tasks.length < total && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="hud-btn w-full mt-3 py-2 text-xs cursor-pointer disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Load More'}
        </button>
      )}
    </div>
  );
}
