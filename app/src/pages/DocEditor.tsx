import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { RichTextEditor } from '../components/RichTextEditor';
import { docsApi } from '../api/services';
import { ApiError } from '../api/client';
import type { Doc } from '../types';

export function DocEditor() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!docId) return;
    setLoading(true);
    docsApi
      .get(docId)
      .then((fresh) => {
        setDoc(fresh);
        setTitle(fresh.title);
        setNotFound(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
        else throw err;
      })
      .finally(() => setLoading(false));
  }, [docId]);

  const saveTitle = async () => {
    if (!doc || !title.trim() || title === doc.title) {
      if (doc) setTitle(doc.title);
      return;
    }
    setSaving(true);
    try {
      const updated = await docsApi.update(doc.id, { title: title.trim() });
      setDoc(updated);
    } finally {
      setSaving(false);
    }
  };

  const saveContent = async (html: string) => {
    if (!doc || html === doc.content) return;
    const updated = await docsApi.update(doc.id, { content: html });
    setDoc(updated);
  };

  const removeDoc = async () => {
    if (!doc) return;
    if (!confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    await docsApi.remove(doc.id);
    navigate('/docs');
  };

  if (loading) {
    return <p className="text-sm text-mist-dim font-body px-4 py-8">Loading…</p>;
  }
  if (notFound || !doc) {
    return (
      <div className="max-w-3xl mx-auto">
        <p className="text-sm text-mist-dim font-body px-4 py-8">Doc not found.</p>
        <button onClick={() => navigate('/docs')} className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
          ← Back to Docs
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto animate-flicker-in">
      <button onClick={() => navigate('/docs')} className="text-xs text-mist-dim hover:text-cyan-bright cursor-pointer mb-4">
        ← Back
      </button>

      <Panel className="p-6">
        <div className="flex items-center justify-between gap-3 mb-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            className="flex-1 min-w-0 bg-transparent font-display font-bold text-xl uppercase tracking-wide text-glow-cyan focus:outline-none"
            aria-label="Doc title"
          />
          <button onClick={removeDoc} className="text-mist-dim hover:text-danger text-xs px-2 py-1 cursor-pointer shrink-0">
            Delete
          </button>
        </div>
        <p className="text-[10px] font-mono text-mist-dim mb-4">
          {doc.authorName} · {saving ? 'Saving…' : `updated ${new Date(doc.updatedAt).toLocaleString()}`}
        </p>

        <RichTextEditor value={doc.content} onSave={saveContent} placeholder="Start writing…" />
      </Panel>
    </div>
  );
}
