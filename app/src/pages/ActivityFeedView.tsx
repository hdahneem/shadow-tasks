import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { useStore } from '../store/useStore';
import { workspacesApi } from '../api/services';
import { describeActivity } from '../lib/activityDescriptions';
import type { WorkspaceActivityEntry } from '../types';

const PAGE_SIZE = 50;

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function ActivityFeedView() {
  const currentWorkspaceId = useStore((s) => s.currentWorkspaceId);
  const [entries, setEntries] = useState<WorkspaceActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    workspacesApi.activity(currentWorkspaceId, PAGE_SIZE, 0).then((fresh) => {
      setEntries(fresh);
      setHasMore(fresh.length === PAGE_SIZE);
      setLoading(false);
    });
  }, [currentWorkspaceId]);

  const loadMore = async () => {
    if (!currentWorkspaceId) return;
    setLoadingMore(true);
    try {
      const more = await workspacesApi.activity(currentWorkspaceId, PAGE_SIZE, entries.length);
      setEntries((prev) => [...prev, ...more]);
      setHasMore(more.length === PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto animate-flicker-in">
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan">Activity</h1>
        <p className="text-sm text-mist-dim mt-1">Recent activity across every quest in this workspace.</p>
      </div>

      <Panel>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">Nothing has happened yet.</p>
        ) : (
          entries.map((e) => (
            <div key={e.id} className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-cyan-dim/10">
              <div className="min-w-0">
                <p className="text-sm text-mist">{describeActivity(e.actorName ?? 'Someone', e.type, e.payload)}</p>
                <Link to={`/tasks/${e.taskId}`} className="text-xs text-cyan-bright hover:underline">
                  {e.taskTitle}
                </Link>
              </div>
              <span className="font-mono text-[11px] text-mist-dim shrink-0">{formatTimestamp(e.createdAt)}</span>
            </div>
          ))
        )}
      </Panel>

      {!loading && hasMore && (
        <button
          onClick={loadMore}
          disabled={loadingMore}
          className="hud-btn text-xs px-3 py-1.5 cursor-pointer mt-4 disabled:opacity-50"
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
