import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { Panel } from '../components/Panel';
import { searchApi, savedSearchesApi, type SearchQuery } from '../api/services';
import type { Priority, SearchResults, SavedSearch } from '../types';

const PRIORITY_COLOR: Record<Priority, string> = {
  low: '#4ade80',
  medium: '#facc15',
  high: '#f43f5e',
};

function highlightMatch(text: string, query: string): string {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 60);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}

// Doc content is stored as the rich text editor's HTML — strip tags down to
// plain text before it's used as a search-result snippet.
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function SearchView() {
  const projects = useStore((s) => s.projects);

  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState<Priority | ''>('');
  const [done, setDone] = useState<'' | 'true' | 'false'>('');
  const [projectId, setProjectId] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');

  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [savingName, setSavingName] = useState<string | null>(null);

  const currentQuery: SearchQuery = {
    q: query.trim() || undefined,
    priority: priority || undefined,
    done: done === '' ? undefined : done === 'true',
    projectId: projectId || undefined,
    dueFrom: dueFrom || undefined,
    dueTo: dueTo || undefined,
  };
  const hasAnyCriteria = Object.values(currentQuery).some((v) => v !== undefined);

  useEffect(() => {
    savedSearchesApi.list().then(setSavedSearches);
  }, []);

  useEffect(() => {
    if (!hasAnyCriteria) {
      setResults(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(() => {
      searchApi.run(currentQuery).then((r) => {
        setResults(r);
        setLoading(false);
      });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, priority, done, projectId, dueFrom, dueTo]);

  const applySaved = (saved: SavedSearch) => {
    setQuery(saved.query ?? '');
    setPriority((saved.filters?.priority as Priority) ?? '');
    setDone(saved.filters?.done === undefined ? '' : saved.filters.done ? 'true' : 'false');
    setProjectId(saved.filters?.projectId ?? '');
    setDueFrom(saved.filters?.dueFrom ?? '');
    setDueTo(saved.filters?.dueTo ?? '');
  };

  const saveCurrentSearch = async () => {
    if (!savingName?.trim()) return;
    const saved = await savedSearchesApi.create({
      name: savingName.trim(),
      query: currentQuery.q,
      filters: {
        priority: currentQuery.priority,
        done: currentQuery.done,
        projectId: currentQuery.projectId,
        dueFrom: currentQuery.dueFrom,
        dueTo: currentQuery.dueTo,
      },
    });
    setSavedSearches((prev) => [saved, ...prev]);
    setSavingName(null);
  };

  const removeSaved = async (id: string) => {
    await savedSearchesApi.remove(id);
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div className="max-w-4xl mx-auto animate-flicker-in">
      <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan mb-6">
        Search
      </h1>

      <Panel className="p-5 mb-6">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search quests, comments, and docs…"
          className="hud-input w-full px-3 py-2.5 text-sm mb-4"
        />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority | '')}
            className="hud-input px-2 py-1.5 text-xs capitalize"
          >
            <option value="">Any priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <select
            value={done}
            onChange={(e) => setDone(e.target.value as '' | 'true' | 'false')}
            className="hud-input px-2 py-1.5 text-xs"
          >
            <option value="">Active + done</option>
            <option value="false">Active only</option>
            <option value="true">Done only</option>
          </select>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="hud-input px-2 py-1.5 text-xs"
          >
            <option value="">Any project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dueFrom}
            onChange={(e) => setDueFrom(e.target.value)}
            className="hud-input px-2 py-1.5 text-xs"
            title="Due from"
          />
          <input
            type="date"
            value={dueTo}
            onChange={(e) => setDueTo(e.target.value)}
            className="hud-input px-2 py-1.5 text-xs"
            title="Due to"
          />
        </div>

        {hasAnyCriteria && (
          <div className="mt-4 pt-4 border-t border-cyan-dim/15">
            {savingName === null ? (
              <button
                onClick={() => setSavingName('')}
                className="hud-btn text-xs px-3 py-1.5 cursor-pointer"
              >
                Save this search
              </button>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  saveCurrentSearch();
                }}
                className="flex gap-2"
              >
                <input
                  autoFocus
                  value={savingName}
                  onChange={(e) => setSavingName(e.target.value)}
                  placeholder="Name this search…"
                  className="hud-input flex-1 px-3 py-1.5 text-sm"
                />
                <button type="submit" className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setSavingName(null)}
                  className="text-xs text-mist-dim hover:text-danger cursor-pointer px-2"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        )}
      </Panel>

      {savedSearches.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {savedSearches.map((s) => (
            <div key={s.id} className="flex items-center gap-1.5 hud-btn text-xs px-3 py-1.5">
              <button onClick={() => applySaved(s)} className="cursor-pointer">
                {s.name}
              </button>
              <button
                onClick={() => removeSaved(s.id)}
                className="text-mist-dim hover:text-danger cursor-pointer"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {!hasAnyCriteria && (
        <p className="text-mist-dim text-sm">Type a query or set a filter to search your quests.</p>
      )}

      {hasAnyCriteria && loading && <p className="text-mist-dim text-sm">Searching…</p>}

      {hasAnyCriteria && !loading && results && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="font-display font-bold text-xs tracking-widest uppercase text-mist mb-2">
              Quests ({results.tasks.length})
            </h2>
            {results.tasks.length === 0 ? (
              <p className="text-mist-dim text-sm">No matching quests.</p>
            ) : (
              <Panel>
                {results.tasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className="flex items-center gap-2 px-3 py-2.5 border-b border-cyan-dim/10 last:border-b-0 hover:bg-cyan-dim/5"
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: PRIORITY_COLOR[task.priority] }}
                    />
                    <span className={`text-sm truncate ${task.done ? 'task-strike' : ''}`}>{task.title}</span>
                    {task.list?.project && (
                      <span className="ml-auto shrink-0 font-mono text-[11px] text-mist-dim truncate">
                        {task.list.project.name} / {task.list.name}
                      </span>
                    )}
                  </Link>
                ))}
              </Panel>
            )}
          </div>

          <div>
            <h2 className="font-display font-bold text-xs tracking-widest uppercase text-mist mb-2">
              Comments ({results.comments.length})
            </h2>
            {results.comments.length === 0 ? (
              <p className="text-mist-dim text-sm">No matching comments.</p>
            ) : (
              <Panel>
                {results.comments.map((hit) => (
                  <Link
                    key={hit.id}
                    to={`/tasks/${hit.task.id}`}
                    className="block px-3 py-2.5 border-b border-cyan-dim/10 last:border-b-0 hover:bg-cyan-dim/5"
                  >
                    <div className="text-[11px] text-mist-dim mb-0.5">
                      In <span className="text-cyan-bright">{hit.task.title}</span> · {hit.task.list.project.name} / {hit.task.list.name}
                    </div>
                    <p className="text-sm">“{highlightMatch(hit.body, query)}”</p>
                  </Link>
                ))}
              </Panel>
            )}
          </div>

          <div>
            <h2 className="font-display font-bold text-xs tracking-widest uppercase text-mist mb-2">
              Docs ({results.docs.length})
            </h2>
            {results.docs.length === 0 ? (
              <p className="text-mist-dim text-sm">No matching docs.</p>
            ) : (
              <Panel>
                {results.docs.map((doc) => (
                  <Link
                    key={doc.id}
                    to={`/docs/${doc.id}`}
                    className="block px-3 py-2.5 border-b border-cyan-dim/10 last:border-b-0 hover:bg-cyan-dim/5"
                  >
                    <div className="text-[11px] text-mist-dim mb-0.5">
                      <span className="text-cyan-bright">{doc.title}</span> · {doc.workspace.name}
                    </div>
                    {stripHtml(doc.content) && (
                      <p className="text-sm">“{highlightMatch(stripHtml(doc.content), query)}”</p>
                    )}
                  </Link>
                ))}
              </Panel>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
