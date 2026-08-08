import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { RichTextEditor } from '../components/RichTextEditor';
import { SubtaskTree } from '../components/SubtaskTree';
import { CustomFieldsPanel } from '../components/CustomFieldsPanel';
import { DependenciesPanel } from '../components/DependenciesPanel';
import { RelatedTasksPanel } from '../components/RelatedTasksPanel';
import { RecurrencePanel } from '../components/RecurrencePanel';
import { AssigneesPanel } from '../components/AssigneesPanel';
import { TagsPanel } from '../components/TagsPanel';
import { TimeTrackingPanel } from '../components/TimeTrackingPanel';
import { SharePanel } from '../components/SharePanel';
import { ProgressBar } from '../components/ProgressBar';
import { SaveAsTemplateModal } from '../components/SaveAsTemplateModal';
import { MentionInput } from '../components/MentionInput';
import { tasksApi, commentsApi, attachmentsApi, statusesApi, taskTemplatesApi, workspacesApi } from '../api/services';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { ApiError, errorMessage, resolveAssetUrl } from '../api/client';
import { toast } from '../store/useToastStore';
import { describeActivity as describeActivitySentence } from '../lib/activityDescriptions';
import type { Task, Priority, Status, WorkspaceMember } from '../types';

const PRIORITIES: Priority[] = ['low', 'medium', 'high'];
const COLORS = ['#22d3ee', '#a855f7', '#4ade80', '#facc15', '#f43f5e', '#fb923c', null];

function toDateInputValue(iso?: string | null) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function describeActivity(entry: NonNullable<Task['activity']>[number]): string {
  const who = entry.actor?.name ?? 'Someone';
  return describeActivitySentence(who, entry.type, entry.payload as Record<string, unknown> | null);
}

export function TaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const lists = useStore((s) => s.lists);
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [task, setTask] = useState<Task | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [uploading, setUploading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const refetch = useCallback(async () => {
    if (!taskId) return;
    // Tasks created offline live only in the local store until they sync — there's
    // no server id to GET yet, so read the cached copy instead of hitting the API.
    if (taskId.startsWith('temp-')) {
      const cached = useStore.getState().tasks.find((t) => t.id === taskId);
      setTask(cached ?? null);
      setNotFound(!cached);
      setLoading(false);
      return;
    }
    try {
      const fresh = await tasksApi.get(taskId);
      setTask(fresh);
      setNotFound(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true);
      else throw err;
    } finally {
      setLoading(false);
    }
    useStore.getState().refreshTasks().catch(() => {});
  }, [taskId]);

  useEffect(() => {
    setLoading(true);
    refetch();
  }, [refetch]);

  // If this temp-id task syncs while its detail page is open, swap over to the
  // real id it was assigned rather than leaving the user on a now-dead URL.
  const lastResolvedTempId = useStore((s) => s.lastResolvedTempId);
  useEffect(() => {
    if (lastResolvedTempId && lastResolvedTempId.tempId === taskId) {
      navigate(`/tasks/${lastResolvedTempId.realId}`, { replace: true });
    }
  }, [lastResolvedTempId, taskId, navigate]);

  useEffect(() => {
    if (!task?.projectId) return;
    statusesApi.listForProject(task.projectId).then(setStatuses);
  }, [task?.projectId]);

  useEffect(() => {
    if (!task?.workspaceId) return;
    workspacesApi.members(task.workspaceId).then(setWorkspaceMembers);
  }, [task?.workspaceId]);

  const mentionCandidates = workspaceMembers.map((m) => ({ id: m.user.id, name: m.user.name }));

  const changeStatus = async (statusId: string) => {
    if (!task) return;
    setCompletionError(null);
    try {
      await useStore.getState().setTaskStatus(task.id, statusId);
      refetch();
    } catch (err) {
      // a 400 here means the store-level toast wouldn't say *why* (blocked by an
      // unfinished dependency) — show that specific reason inline instead. Any
      // other failure already got a generic error toast from the store.
      if (err instanceof ApiError && err.status === 400) setCompletionError(err.message);
    }
  };

  const patch = async (data: Parameters<typeof tasksApi.update>[1]) => {
    if (!task) return;
    const inGlobalStore = useStore.getState().tasks.some((t) => t.id === task.id);
    if (inGlobalStore) {
      // Routes through the store so offline edits queue correctly (see useStore's
      // updateTask) instead of always hitting the network directly.
      await useStore.getState().updateTask(task.id, data);
      const stored = useStore.getState().tasks.find((t) => t.id === task.id);
      if (stored) setTask(stored);
      return;
    }
    // Subtasks aren't in the global cache, so they always go straight to the API —
    // that path has no offline support (see the offline-scope decision) and needs
    // its own error surfacing since it isn't wrapped by the store's toast handling.
    try {
      const updated = await tasksApi.update(task.id, data);
      setTask((t) => (t ? { ...t, ...updated } : t));
      useStore.getState().refreshTasks().catch(() => {});
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update quest.'));
      throw err;
    }
  };

  const toggleDone = async () => {
    if (!task) return;
    setCompletionError(null);
    // subtasks aren't in the global task cache, so they update via a direct API call
    // instead of the store — that path doesn't get the store's automatic error toast.
    const inGlobalStore = useStore.getState().tasks.some((t) => t.id === task.id);
    try {
      if (inGlobalStore) {
        await useStore.getState().toggleTask(task.id);
      } else {
        await tasksApi.update(task.id, { done: !task.done });
      }
      refetch();
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setCompletionError(err.message);
      else if (!inGlobalStore) toast.error(errorMessage(err, 'Could not update quest.'));
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm(`Delete "${task.title}" permanently? This cannot be undone.`)) return;
    await tasksApi.remove(task.id);
    useStore.getState().refreshTasks().catch(() => {});
    if (task.parentTaskId) navigate(`/tasks/${task.parentTaskId}`);
    else navigate(-1);
  };

  const handleDuplicate = async () => {
    if (!task) return;
    const copy = await tasksApi.duplicate(task.id);
    useStore.getState().refreshTasks().catch(() => {});
    navigate(`/tasks/${copy.id}`);
  };

  const handleArchiveToggle = async () => {
    if (!task) return;
    const updated = task.archivedAt ? await tasksApi.restore(task.id) : await tasksApi.archive(task.id);
    setTask((t) => (t ? { ...t, ...updated } : t));
    useStore.getState().refreshTasks().catch(() => {});
  };

  const handleMove = async (listId: string) => {
    if (!task || !listId || listId === task.listId) return;
    await tasksApi.move(task.id, listId);
    refetch();
  };

  const handleCoverUpload = async (file: File) => {
    if (!task) return;
    setUploading(true);
    try {
      const attachment = await tasksApi.uploadAttachment(task.id, file);
      await patch({ coverImageUrl: attachment.url });
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not upload that image.'));
    } finally {
      setUploading(false);
    }
  };

  const handleAttachmentUpload = async (file: File) => {
    if (!task) return;
    setUploading(true);
    try {
      await tasksApi.uploadAttachment(task.id, file);
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not upload that file.'));
    } finally {
      setUploading(false);
    }
  };

  const submitComment = async () => {
    if (!task || !commentDraft.trim()) return;
    await tasksApi.addComment(task.id, commentDraft.trim());
    setCommentDraft('');
    refetch();
  };

  const submitReply = async (parentCommentId: string) => {
    if (!task || !replyDraft.trim()) return;
    await tasksApi.addComment(task.id, replyDraft.trim(), parentCommentId);
    setReplyDraft('');
    setReplyingToId(null);
    refetch();
  };

  const deleteComment = async (commentId: string) => {
    if (!confirm('Delete this comment?')) return;
    await commentsApi.remove(commentId);
    refetch();
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto animate-flicker-in">
        <p className="text-mist-dim text-sm">Loading quest…</p>
      </div>
    );
  }

  if (notFound || !task) {
    return (
      <div className="max-w-3xl mx-auto animate-flicker-in">
        <Panel className="p-8 text-center">
          <p className="text-mist-dim text-sm mb-4">This quest doesn't exist or was deleted.</p>
          <button onClick={() => navigate('/')} className="hud-btn px-4 py-2 text-sm cursor-pointer">
            Back to Status Window
          </button>
        </Panel>
      </div>
    );
  }

  const sameProjectLists = lists.filter((l) => l.projectId === task.projectId);
  const isArchived = !!task.archivedAt;

  return (
    <div className="max-w-3xl mx-auto animate-flicker-in flex flex-col gap-6">
      <button
        onClick={() => navigate(-1)}
        className="text-xs text-mist hover:text-cyan-bright self-start cursor-pointer"
      >
        ← Back
      </button>

      {isArchived && (
        <Panel violet className="p-4 flex items-center justify-between">
          <span className="text-sm text-mist">This quest has been archived.</span>
          <button onClick={handleArchiveToggle} className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
            Restore
          </button>
        </Panel>
      )}

      {task.coverImageUrl && (
        <div className="relative">
          <img src={resolveAssetUrl(task.coverImageUrl)} alt="" className="w-full max-h-56 object-cover" />
          <button
            onClick={() => patch({ coverImageUrl: null })}
            className="absolute top-2 right-2 hud-btn text-xs px-2 py-1 cursor-pointer"
          >
            Remove cover
          </button>
        </div>
      )}

      <Panel className="p-6">
        {completionError && (
          <div className="mb-4 px-3 py-2 border border-danger/40 bg-danger/10 text-danger text-sm">
            {completionError}
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <button
              onClick={toggleDone}
              className="shrink-0 mt-1 w-6 h-6 border cursor-pointer flex items-center justify-center"
              style={{
                borderColor: task.done ? '#4ade80' : 'rgba(34,211,238,0.5)',
                background: task.done ? 'rgba(74,222,128,0.15)' : 'transparent',
              }}
              aria-label={task.done ? 'Mark incomplete' : 'Mark complete'}
            >
              {task.done && <span style={{ color: '#4ade80' }}>✓</span>}
            </button>

            {editingTitle ? (
              <input
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  setEditingTitle(false);
                  if (titleDraft.trim() && titleDraft !== task.title) patch({ title: titleDraft.trim() });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingTitle(false);
                }}
                className="hud-input flex-1 px-2 py-1 text-xl font-display font-bold"
              />
            ) : (
              <h1
                onClick={() => {
                  setTitleDraft(task.title);
                  setEditingTitle(true);
                }}
                className={`font-display font-bold text-lg sm:text-xl uppercase tracking-wide cursor-text ${task.done ? 'task-strike' : 'text-glow-cyan'}`}
              >
                {task.title}
              </h1>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button onClick={handleDuplicate} className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
              Duplicate
            </button>
            <button onClick={() => setSavingTemplate(true)} className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
              Save as Template
            </button>
            {!isArchived && (
              <button onClick={handleArchiveToggle} className="hud-btn text-xs px-3 py-1.5 cursor-pointer">
                Archive
              </button>
            )}
            <button
              onClick={handleDelete}
              className="hud-btn text-xs px-3 py-1.5 cursor-pointer text-danger border-danger/40"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
          <Field label="Status">
            <select
              value={task.statusId ?? ''}
              onChange={(e) => changeStatus(e.target.value)}
              className="hud-input w-full px-2 py-1.5 text-xs"
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={task.priority}
              onChange={(e) => patch({ priority: e.target.value as Priority })}
              className="hud-input w-full px-2 py-1.5 text-xs capitalize"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start">
            <input
              type="date"
              value={toDateInputValue(task.startDate)}
              onChange={(e) =>
                patch({ startDate: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
              className="hud-input w-full px-2 py-1.5 text-xs"
            />
          </Field>
          <Field label="Due">
            <input
              type="date"
              value={toDateInputValue(task.dueDate)}
              onChange={(e) =>
                patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })
              }
              className="hud-input w-full px-2 py-1.5 text-xs"
            />
          </Field>
          <Field label="Move to list">
            <select
              value={task.listId}
              onChange={(e) => handleMove(e.target.value)}
              className="hud-input w-full px-2 py-1.5 text-xs"
            >
              {sameProjectLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mb-5">
          <span className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">Color</span>
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button
                key={c ?? 'none'}
                onClick={() => patch({ color: c })}
                className="w-6 h-6 rounded-full cursor-pointer border-2"
                style={{
                  background: c ?? 'transparent',
                  borderColor: task.color === c ? '#e8eaee' : 'rgba(255,255,255,0.2)',
                }}
                aria-label={c ?? 'No color'}
              />
            ))}
          </div>
        </div>

        {!task.coverImageUrl && (
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={uploading}
            className="hud-btn text-xs px-3 py-1.5 cursor-pointer mb-5 disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : '+ Add cover image'}
          </button>
        )}
        <input
          ref={coverInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleCoverUpload(file);
            e.target.value = '';
          }}
        />

        <div>
          <span className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
            Description
          </span>
          <RichTextEditor value={task.description ?? ''} onSave={(html) => patch({ description: html })} />
        </div>
      </Panel>

      {task.id.startsWith('temp-') ? (
        <Panel className="p-6">
          <p className="text-mist-dim text-sm">
            Custom fields, subtasks, dependencies, assignees, tags, time tracking, sharing, attachments, and
            comments all need this quest to sync with the server first — available once you're back online.
          </p>
        </Panel>
      ) : (
        <>
      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Custom Fields
        </h2>
        <CustomFieldsPanel
          taskId={task.id}
          projectId={task.projectId!}
          fields={task.customFields ?? []}
          onChanged={refetch}
        />
      </Panel>

      <Panel className="p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright">
            Subtasks
          </h2>
          {(task.subtasks?.length ?? 0) > 0 && (
            <span className="w-32">
              <ProgressBar value={task.progress} max={100} />
            </span>
          )}
        </div>
        <SubtaskTree
          parentTaskId={task.id}
          listId={task.listId}
          nodes={task.subtasks ?? []}
          onChanged={refetch}
        />
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Dependencies
        </h2>
        <DependenciesPanel task={task} onChanged={refetch} />
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Related Quests
        </h2>
        <RelatedTasksPanel task={task} onChanged={refetch} />
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Assignees
        </h2>
        <AssigneesPanel task={task} onChanged={refetch} />
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Tags
        </h2>
        <TagsPanel task={task} onChanged={refetch} />
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Time Tracking
        </h2>
        <TimeTrackingPanel task={task} onChanged={refetch} />
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Public Sharing
        </h2>
        <SharePanel task={task} onChanged={refetch} />
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Recurrence
        </h2>
        <RecurrencePanel task={task} onChanged={refetch} />
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Attachments
        </h2>
        <div className="flex flex-col gap-2 mb-3">
          {(task.attachments ?? []).map((a) => (
            <div key={a.id} className="flex items-center gap-3 text-sm">
              <a href={resolveAssetUrl(a.url)} target="_blank" rel="noreferrer" className="shrink-0">
                {a.mimeType.startsWith('image/') ? (
                  <img
                    src={resolveAssetUrl(a.url)}
                    alt={a.filename}
                    className="w-10 h-10 object-cover border border-cyan-dim/30"
                  />
                ) : (
                  <span className="w-10 h-10 flex items-center justify-center border border-cyan-dim/30 text-mist-dim text-[10px] uppercase">
                    {a.filename.split('.').pop()?.slice(0, 4) || 'file'}
                  </span>
                )}
              </a>
              <a
                href={resolveAssetUrl(a.url)}
                target="_blank"
                rel="noreferrer"
                className="text-cyan-bright hover:underline truncate flex-1"
              >
                {a.filename}
              </a>
              <button
                onClick={async () => {
                  await attachmentsApi.remove(a.id);
                  refetch();
                }}
                className="text-mist-dim hover:text-danger text-xs cursor-pointer shrink-0"
              >
                Remove
              </button>
            </div>
          ))}
          {(task.attachments?.length ?? 0) === 0 && (
            <p className="text-mist-dim text-sm">No attachments yet.</p>
          )}
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : '+ Add attachment'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleAttachmentUpload(file);
            e.target.value = '';
          }}
        />
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Comments
        </h2>
        <div className="flex flex-col gap-4 mb-4">
          {(task.comments ?? [])
            .filter((c) => !c.parentCommentId)
            .map((c) => {
              const replies = (task.comments ?? []).filter((r) => r.parentCommentId === c.id);
              return (
                <div key={c.id} className="flex flex-col gap-3">
                  <div className="group">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-sm font-semibold text-cyan-bright">{c.author.name}</span>
                      <span className="text-[11px] text-mist-dim">
                        {new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                      <button
                        onClick={() => {
                          setReplyingToId(replyingToId === c.id ? null : c.id);
                          setReplyDraft('');
                        }}
                        className="text-mist-dim hover:text-cyan-bright text-[11px] cursor-pointer"
                      >
                        Reply
                      </button>
                      {c.authorId === currentUserId && (
                        <button
                          onClick={() => deleteComment(c.id)}
                          className="opacity-0 group-hover:opacity-100 text-mist-dim hover:text-danger text-[11px] cursor-pointer ml-auto"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{c.body}</p>
                  </div>

                  {replies.length > 0 && (
                    <div className="flex flex-col gap-3 pl-5 border-l border-cyan-dim/20">
                      {replies.map((r) => (
                        <div key={r.id} className="group">
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-sm font-semibold text-cyan-bright">{r.author.name}</span>
                            <span className="text-[11px] text-mist-dim">
                              {new Date(r.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </span>
                            {r.authorId === currentUserId && (
                              <button
                                onClick={() => deleteComment(r.id)}
                                className="opacity-0 group-hover:opacity-100 text-mist-dim hover:text-danger text-[11px] cursor-pointer ml-auto"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{r.body}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {replyingToId === c.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submitReply(c.id);
                      }}
                      className="flex gap-2 pl-5"
                    >
                      <MentionInput
                        autoFocus
                        value={replyDraft}
                        onChange={setReplyDraft}
                        members={mentionCandidates}
                        placeholder={`Reply to ${c.author.name}...`}
                        className="hud-input w-full px-3 py-2 text-sm"
                      />
                      <button type="submit" className="hud-btn text-xs px-4 py-2 cursor-pointer">
                        Reply
                      </button>
                    </form>
                  )}
                </div>
              );
            })}
          {(task.comments?.length ?? 0) === 0 && (
            <p className="text-mist-dim text-sm">No comments yet.</p>
          )}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitComment();
          }}
          className="flex gap-2"
        >
          <MentionInput
            value={commentDraft}
            onChange={setCommentDraft}
            members={mentionCandidates}
            placeholder="Add a comment..."
            className="hud-input w-full px-3 py-2 text-sm"
          />
          <button type="submit" className="hud-btn text-xs px-4 py-2 cursor-pointer">
            Post
          </button>
        </form>
      </Panel>

      <Panel className="p-6">
        <h2 className="font-display font-bold uppercase tracking-widest text-sm text-cyan-bright mb-3">
          Activity
        </h2>
        <div className="flex flex-col gap-2">
          {(task.activity ?? []).map((entry) => (
            <div key={entry.id} className="flex items-baseline gap-2 text-sm">
              <span className="text-mist-dim text-[11px] font-mono shrink-0">
                {new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
              <span className="text-mist">{describeActivity(entry)}</span>
            </div>
          ))}
        </div>
      </Panel>
        </>
      )}

      {savingTemplate && (
        <SaveAsTemplateModal
          title="Save Quest as Template"
          placeholder="e.g. Scouting Checklist"
          onSave={(name) => taskTemplatesApi.saveFromTask(task.id, name).then(() => {})}
          onClose={() => setSavingTemplate(false)}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="block font-body text-[11px] tracking-widest uppercase text-mist mb-1">{label}</span>
      {children}
    </div>
  );
}
