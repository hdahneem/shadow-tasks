import { useEffect, useState } from 'react';
import { Panel } from '../components/Panel';
import { ProgressBar } from '../components/ProgressBar';
import { useStore } from '../store/useStore';
import { workspacesApi } from '../api/services';
import type { WorkloadEntry } from '../types';

function formatMinutes(minutes: number) {
  if (minutes <= 0) return '0h';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

export function WorkloadView() {
  const currentWorkspaceId = useStore((s) => s.currentWorkspaceId);
  const [entries, setEntries] = useState<WorkloadEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    workspacesApi.workload(currentWorkspaceId).then((data) => {
      setEntries([...data].sort((a, b) => b.openTasks - a.openTasks));
      setLoading(false);
    });
  }, [currentWorkspaceId]);

  const maxOpen = Math.max(1, ...entries.map((e) => e.openTasks));

  return (
    <div className="max-w-3xl mx-auto animate-flicker-in">
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan">Workload</h1>
        <p className="text-sm text-mist-dim mt-1">Open quest load per hunter across this workspace.</p>
      </div>

      <Panel>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">No members in this workspace.</p>
        ) : (
          <div className="flex flex-col divide-y divide-cyan-dim/10">
            {entries.map((e) => (
              <div key={e.userId} className="px-4 py-3">
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="text-sm text-mist font-body truncate">{e.name}</span>
                  <div className="flex items-center gap-3 shrink-0 text-[11px] text-mist-dim font-mono">
                    {e.overdueTasks > 0 && (
                      <span className="text-danger">{e.overdueTasks} overdue</span>
                    )}
                    <span>{e.openTasks} open</span>
                    <span>{e.doneTasks} done</span>
                    {e.estimatedMinutes > 0 && <span>{formatMinutes(e.estimatedMinutes)} est.</span>}
                  </div>
                </div>
                <ProgressBar value={e.openTasks} max={maxOpen} />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
