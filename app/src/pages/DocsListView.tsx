import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { useStore } from '../store/useStore';
import { docsApi } from '../api/services';
import type { DocSummary } from '../types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function DocsListView() {
  const currentWorkspaceId = useStore((s) => s.currentWorkspaceId);
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  const refetch = () => {
    if (!currentWorkspaceId) return;
    setLoading(true);
    docsApi.list(currentWorkspaceId).then((fresh) => {
      setDocs(fresh);
      setLoading(false);
    });
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspaceId]);

  const createDoc = async () => {
    if (!title.trim() || !currentWorkspaceId) return;
    setError(null);
    try {
      const doc = await docsApi.create(currentWorkspaceId, title.trim());
      setCreating(false);
      setTitle('');
      navigate(`/docs/${doc.id}`);
    } catch {
      setError('Could not create that doc.');
    }
  };

  const removeDoc = async (id: string, docTitle: string) => {
    if (!confirm(`Delete "${docTitle}"? This cannot be undone.`)) return;
    await docsApi.remove(id);
    refetch();
  };

  return (
    <div className="max-w-3xl mx-auto animate-flicker-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan">Docs</h1>
        {!creating && (
          <button onClick={() => setCreating(true)} className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
            + New Doc
          </button>
        )}
      </div>

      {creating && (
        <div className="flex gap-2 mb-4">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createDoc()}
            placeholder="Doc title…"
            className="hud-input flex-1 px-3 py-2 text-sm"
          />
          <button onClick={createDoc} disabled={!title.trim()} className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50">
            Create
          </button>
          <button
            onClick={() => {
              setCreating(false);
              setTitle('');
              setError(null);
            }}
            className="text-xs text-mist-dim hover:text-danger cursor-pointer px-2"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-danger text-sm mb-4">{error}</p>}

      <Panel>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-mist-dim font-body">No docs yet. Start one above.</p>
        ) : (
          docs.map((d) => (
            <div
              key={d.id}
              className="group flex items-center gap-3 px-3 py-2.5 border-b border-cyan-dim/10 hover:bg-cyan-dim/5 transition-colors"
            >
              <Link to={`/docs/${d.id}`} className="flex-1 min-w-0 font-body text-sm text-mist hover:underline">
                <span className="truncate block">{d.title}</span>
                <span className="block truncate font-mono text-[10px] text-mist-dim">
                  {d.authorName} · updated {formatDate(d.updatedAt)}
                </span>
              </Link>
              <button
                onClick={() => removeDoc(d.id, d.title)}
                className="opacity-0 group-hover:opacity-100 text-mist-dim hover:text-danger text-xs px-1 cursor-pointer shrink-0"
                title="Delete doc"
              >
                ✕
              </button>
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
