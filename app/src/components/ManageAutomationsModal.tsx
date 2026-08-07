import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { automationsApi, statusesApi, workspacesApi, tagsApi } from '../api/services';
import { ApiError } from '../api/client';
import {
  AUTOMATION_ACTION_LABELS,
  AUTOMATION_TRIGGER_LABELS,
  type Automation,
  type AutomationActionType,
  type AutomationTriggerType,
  type Priority,
  type Status,
  type Tag,
  type WorkspaceMember,
} from '../types';

function summarize(automation: Automation, statuses: Status[], members: WorkspaceMember[], tags: Tag[]): string {
  const statusName = (id?: string) => statuses.find((s) => s.id === id)?.name ?? 'a status';
  const memberName = (id?: string) => members.find((m) => m.user.id === id)?.user.name ?? 'someone';
  const tagName = (id?: string) => tags.find((t) => t.id === id)?.name ?? 'a tag';

  const trigger =
    automation.triggerType === 'status_changed_to'
      ? `Status changed to ${statusName(automation.triggerConfig.statusId)}`
      : AUTOMATION_TRIGGER_LABELS[automation.triggerType];

  let action: string;
  switch (automation.actionType) {
    case 'set_status':
      action = `set status to ${statusName(automation.actionConfig.statusId)}`;
      break;
    case 'set_priority':
      action = `set priority to ${automation.actionConfig.priority}`;
      break;
    case 'assign_user':
      action = `assign ${memberName(automation.actionConfig.userId)}`;
      break;
    case 'add_comment':
      action = 'add a comment';
      break;
    case 'add_tag':
      action = `add the "${tagName(automation.actionConfig.tagId)}" tag`;
      break;
  }
  return `${trigger} → ${action}`;
}

export function ManageAutomationsModal({
  projectId,
  workspaceId,
  onClose,
}: {
  projectId: string;
  workspaceId: string;
  onClose: () => void;
}) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [rowError, setRowError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<AutomationTriggerType>('task_created');
  const [triggerStatusId, setTriggerStatusId] = useState('');
  const [actionType, setActionType] = useState<AutomationActionType>('set_priority');
  const [actionStatusId, setActionStatusId] = useState('');
  const [actionPriority, setActionPriority] = useState<Priority>('medium');
  const [actionUserId, setActionUserId] = useState('');
  const [actionBody, setActionBody] = useState('');
  const [actionTagId, setActionTagId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const refetch = () => automationsApi.listForProject(projectId).then(setAutomations);

  useEffect(() => {
    Promise.all([
      refetch(),
      statusesApi.listForProject(projectId).then((s) => {
        setStatuses(s);
        if (s[0]) {
          setTriggerStatusId(s[0].id);
          setActionStatusId(s[0].id);
        }
      }),
      workspacesApi.members(workspaceId).then((m) => {
        setMembers(m);
        if (m[0]) setActionUserId(m[0].user.id);
      }),
      tagsApi.list(workspaceId).then((t) => {
        setTags(t);
        if (t[0]) setActionTagId(t[0].id);
      }),
    ]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, workspaceId]);

  const toggleEnabled = async (automation: Automation) => {
    await automationsApi.update(automation.id, { enabled: !automation.enabled });
    refetch();
  };

  const remove = async (automation: Automation) => {
    if (!confirm(`Delete automation "${automation.name}"?`)) return;
    setRowError(null);
    try {
      await automationsApi.remove(automation.id);
      refetch();
    } catch (err) {
      setRowError(err instanceof ApiError ? err.message : 'Could not delete this automation. Please try again.');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const triggerConfig = triggerType === 'status_changed_to' ? { statusId: triggerStatusId } : {};
      let actionConfig: Automation['actionConfig'] = {};
      if (actionType === 'set_status') actionConfig = { statusId: actionStatusId };
      else if (actionType === 'set_priority') actionConfig = { priority: actionPriority };
      else if (actionType === 'assign_user') actionConfig = { userId: actionUserId };
      else if (actionType === 'add_comment') actionConfig = { body: actionBody };
      else if (actionType === 'add_tag') actionConfig = { tagId: actionTagId };

      await automationsApi.create(projectId, { name: name.trim(), triggerType, triggerConfig, actionType, actionConfig });
      setName('');
      setActionBody('');
      await refetch();
    } catch {
      setCreateError('Could not create the automation. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal title="Automations" onClose={onClose}>
      <div className="flex flex-col gap-4">
        {rowError && <p className="text-danger text-sm">{rowError}</p>}
        {loading ? (
          <p className="text-mist-dim text-sm">Loading…</p>
        ) : automations.length === 0 ? (
          <p className="text-mist-dim text-sm">No automations yet.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {automations.map((a) => (
              <div key={a.id} className="flex items-center gap-2 border border-cyan-dim/20 px-3 py-2">
                <label className="shrink-0 cursor-pointer">
                  <input type="checkbox" checked={a.enabled} onChange={() => toggleEnabled(a)} />
                </label>
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{a.name}</div>
                  <div className="text-[11px] text-mist-dim truncate">{summarize(a, statuses, members, tags)}</div>
                </div>
                <button
                  onClick={() => remove(a)}
                  className="text-mist-dim hover:text-danger text-xs cursor-pointer shrink-0"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={submit} className="flex flex-col gap-3 pt-3 border-t border-cyan-dim/20">
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              Automation Name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Notify on completion"
              className="hud-input w-full px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">When</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value as AutomationTriggerType)}
              className="hud-input w-full px-3 py-2 text-sm cursor-pointer"
            >
              {(Object.keys(AUTOMATION_TRIGGER_LABELS) as AutomationTriggerType[]).map((t) => (
                <option key={t} value={t}>
                  {AUTOMATION_TRIGGER_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {triggerType === 'status_changed_to' && (
            <div>
              <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
                Target Status
              </label>
              <select
                value={triggerStatusId}
                onChange={(e) => setTriggerStatusId(e.target.value)}
                className="hud-input w-full px-3 py-2 text-sm cursor-pointer"
              >
                {statuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">Then</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value as AutomationActionType)}
              className="hud-input w-full px-3 py-2 text-sm cursor-pointer"
            >
              {(Object.keys(AUTOMATION_ACTION_LABELS) as AutomationActionType[]).map((t) => (
                <option key={t} value={t}>
                  {AUTOMATION_ACTION_LABELS[t]}
                </option>
              ))}
            </select>
          </div>

          {actionType === 'set_status' && (
            <select
              value={actionStatusId}
              onChange={(e) => setActionStatusId(e.target.value)}
              className="hud-input w-full px-3 py-2 text-sm cursor-pointer"
            >
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {actionType === 'set_priority' && (
            <select
              value={actionPriority}
              onChange={(e) => setActionPriority(e.target.value as Priority)}
              className="hud-input w-full px-3 py-2 text-sm cursor-pointer"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          )}
          {actionType === 'assign_user' && (
            <select
              value={actionUserId}
              onChange={(e) => setActionUserId(e.target.value)}
              className="hud-input w-full px-3 py-2 text-sm cursor-pointer"
            >
              {members.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          )}
          {actionType === 'add_comment' && (
            <textarea
              value={actionBody}
              onChange={(e) => setActionBody(e.target.value)}
              placeholder="Comment text…"
              rows={2}
              className="hud-input w-full px-3 py-2 text-sm resize-none"
            />
          )}
          {actionType === 'add_tag' &&
            (tags.length === 0 ? (
              <p className="text-mist-dim text-xs">
                No tags exist in this workspace yet — add one from a quest's Tags panel first.
              </p>
            ) : (
              <select
                value={actionTagId}
                onChange={(e) => setActionTagId(e.target.value)}
                className="hud-input w-full px-3 py-2 text-sm cursor-pointer"
              >
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ))}

          {createError && <p className="text-danger text-sm">{createError}</p>}
          <button
            type="submit"
            disabled={creating || !name.trim() || (actionType === 'add_tag' && tags.length === 0)}
            className="hud-btn hud-btn-solid py-2.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Adding…' : '+ Add Automation'}
          </button>
        </form>
      </div>
    </Modal>
  );
}
