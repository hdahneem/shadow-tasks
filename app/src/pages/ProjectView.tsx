import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { RankBadge } from '../components/RankBadge';
import { ProgressBar } from '../components/ProgressBar';
import { ListSection } from '../components/ListSection';
import { ManageFieldsModal } from '../components/ManageFieldsModal';
import { ManageStatusesModal } from '../components/ManageStatusesModal';
import { ManageAutomationsModal } from '../components/ManageAutomationsModal';
import { ManageProjectAccessModal } from '../components/ManageProjectAccessModal';
import { SaveAsTemplateModal } from '../components/SaveAsTemplateModal';
import { BulkActionsMenu, type BulkActionMenuItem } from '../components/BulkActionsMenu';
import { BulkListPickerModal } from '../components/BulkListPickerModal';
import { BulkTaskPickerModal } from '../components/BulkTaskPickerModal';
import { BulkAssignModal } from '../components/BulkAssignModal';
import { BulkStatusModal } from '../components/BulkStatusModal';
import { BulkDatesModal } from '../components/BulkDatesModal';
import { projectTemplatesApi, tagsApi } from '../api/services';
import { RANKS, type Priority, type Rank, type Tag } from '../types';

type BulkModal = 'assign' | 'status' | 'dates' | 'move' | 'addToList' | 'convertToSubtask' | 'link' | null;

export function ProjectView() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = useStore((s) => s.projects.find((p) => p.id === projectId));
  const allLists = useStore((s) => s.lists);
  const lists = useMemo(() => allLists.filter((l) => l.projectId === projectId), [allLists, projectId]);
  const tasks = useStore((s) => s.tasks);
  const addList = useStore((s) => s.addList);
  const updateProject = useStore((s) => s.updateProject);
  const deleteProject = useStore((s) => s.deleteProject);
  const bulkSetDone = useStore((s) => s.bulkSetDone);
  const bulkSetPriority = useStore((s) => s.bulkSetPriority);
  const bulkArchive = useStore((s) => s.bulkArchive);
  const bulkDelete = useStore((s) => s.bulkDelete);
  const bulkAddTag = useStore((s) => s.bulkAddTag);
  const bulkAssign = useStore((s) => s.bulkAssign);
  const bulkSetStatus = useStore((s) => s.bulkSetStatus);
  const bulkSetDates = useStore((s) => s.bulkSetDates);
  const bulkMove = useStore((s) => s.bulkMove);
  const bulkCopyToList = useStore((s) => s.bulkCopyToList);
  const bulkConvertToSubtask = useStore((s) => s.bulkConvertToSubtask);
  const bulkDuplicate = useStore((s) => s.bulkDuplicate);
  const bulkLinkTasks = useStore((s) => s.bulkLinkTasks);
  const [newListName, setNewListName] = useState('');
  const [managingFields, setManagingFields] = useState(false);
  const [managingStatuses, setManagingStatuses] = useState(false);
  const [managingAutomations, setManagingAutomations] = useState(false);
  const [managingAccess, setManagingAccess] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkModal, setBulkModal] = useState<BulkModal>(null);
  const [tags, setTags] = useState<Tag[]>([]);

  const role = project?.effectiveRole;
  const isAdmin = role === 'admin' || role === 'owner';
  const isMember = isAdmin || role === 'member';

  useEffect(() => {
    if (project?.workspaceId) tagsApi.list(project.workspaceId).then(setTags).catch(() => {});
  }, [project?.workspaceId]);

  const listIds = useMemo(() => lists.map((l) => l.id), [lists]);
  const projectTasks = useMemo(() => tasks.filter((t) => listIds.includes(t.listId)), [tasks, listIds]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());
  const exitSelectMode = () => {
    setSelecting(false);
    clearSelection();
  };

  // Unlike AllQuestsView, ProjectView reads tasks straight from the global
  // store (no separate local pagination copy), so every bulk action here —
  // old and new alike — already lands in `tasks` reactively. No refetch or
  // hand-rolled local transform needed, just busy-state + selection cleanup.
  const runBulk = async (fn: () => Promise<void>) => {
    setBulkBusy(true);
    try {
      await fn();
      clearSelection();
    } catch {
      // error toast already shown by the store
    } finally {
      setBulkBusy(false);
    }
  };

  const runNewBulk = async (fn: () => Promise<void>) => {
    setBulkBusy(true);
    try {
      await fn();
    } finally {
      setBulkBusy(false);
      clearSelection();
    }
  };

  if (!project) {
    return (
      <div className="max-w-3xl mx-auto animate-flicker-in">
        <p className="text-mist-dim text-sm">Project not found.</p>
      </div>
    );
  }

  const selectedCount = selectedIds.size;
  const done = projectTasks.filter((t) => t.done).length;

  const bulkMenuItems: BulkActionMenuItem[] = [
    { key: 'assign', label: 'Assign a Hunter', onSelect: () => setBulkModal('assign') },
    { key: 'status', label: 'Change Status', onSelect: () => setBulkModal('status') },
    { key: 'dates', label: 'Change Dates', onSelect: () => setBulkModal('dates') },
    { key: 'move', label: 'Move to List', onSelect: () => setBulkModal('move') },
    { key: 'addToList', label: 'Add to List', onSelect: () => setBulkModal('addToList') },
    { key: 'convertToSubtask', label: 'Convert to Subtask', onSelect: () => setBulkModal('convertToSubtask') },
    { key: 'duplicate', label: 'Duplicate', onSelect: () => runNewBulk(() => bulkDuplicate([...selectedIds])) },
    { key: 'link', label: 'Link Tasks', onSelect: () => setBulkModal('link') },
  ];

  return (
    <div className="max-w-3xl mx-auto animate-flicker-in">
      <div className="flex items-start flex-wrap justify-between mb-2 gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display font-bold text-2xl text-glow-cyan uppercase tracking-wide">
              {project.name}
            </h1>
            {isAdmin ? (
              <select
                value={project.rank}
                onChange={(e) => updateProject(project.id, { rank: e.target.value as Rank }).catch(() => {})}
                className="hud-input text-xs px-1 py-0.5 cursor-pointer"
                style={{ width: 90 }}
              >
                {RANKS.map((r) => (
                  <option key={r} value={r}>
                    {r}-RANK
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {project.description && <p className="text-sm text-mist max-w-lg">{project.description}</p>}
        </div>
        <div className="flex items-center flex-wrap justify-end gap-3">
          <RankBadge rank={project.rank} />
          <button
            onClick={() => navigate(`/projects/${project.id}/board`)}
            className="hud-btn text-xs px-3 py-1.5 cursor-pointer"
          >
            Board
          </button>
          <button
            onClick={() => navigate(`/projects/${project.id}/table`)}
            className="hud-btn text-xs px-3 py-1.5 cursor-pointer"
          >
            Table
          </button>
          <button
            onClick={() => navigate(`/projects/${project.id}/timeline`)}
            className="hud-btn text-xs px-3 py-1.5 cursor-pointer"
          >
            Timeline
          </button>
          {isMember &&
            (selecting ? (
              <button
                onClick={exitSelectMode}
                className="text-xs text-mist-dim hover:text-danger cursor-pointer uppercase tracking-wider px-1"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={() => setSelecting(true)}
                className="text-xs text-mist-dim hover:text-cyan-bright cursor-pointer uppercase tracking-wider px-1"
              >
                Select
              </button>
            ))}
          {isAdmin && (
            <>
              <button
                onClick={() => setManagingStatuses(true)}
                className="hud-btn text-xs px-3 py-1.5 cursor-pointer"
              >
                Statuses
              </button>
              <button
                onClick={() => setManagingFields(true)}
                className="hud-btn text-xs px-3 py-1.5 cursor-pointer"
              >
                Fields
              </button>
              <button
                onClick={() => setManagingAutomations(true)}
                className="hud-btn text-xs px-3 py-1.5 cursor-pointer"
              >
                Automations
              </button>
              <button
                onClick={() => setManagingAccess(true)}
                className="hud-btn text-xs px-3 py-1.5 cursor-pointer"
              >
                Access
              </button>
            </>
          )}
          {isMember && (
            <button
              onClick={() => setSavingTemplate(true)}
              className="hud-btn text-xs px-3 py-1.5 cursor-pointer"
            >
              Save as Template
            </button>
          )}
          {isAdmin && (
            <button
              onClick={async () => {
                if (confirm(`Delete project "${project.name}" and all its lists/tasks?`)) {
                  try {
                    await deleteProject(project.id);
                    navigate('/');
                  } catch {
                    // error toast already shown by the store
                  }
                }
              }}
              className="hud-btn text-xs px-3 py-1.5 cursor-pointer text-danger border-danger/40"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {projectTasks.length > 0 && (
        <div className="mb-6">
          <ProgressBar value={done} max={projectTasks.length} label="Quest Progress" />
        </div>
      )}

      {selecting && selectedCount > 0 && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 border border-cyan-dim/25 bg-cyan-dim/5 text-xs flex-wrap">
          <span className="text-mist font-mono shrink-0">{selectedCount} selected</span>
          <button
            disabled={bulkBusy}
            onClick={() => runBulk(() => bulkSetDone([...selectedIds], true))}
            className="hud-btn px-2 py-1 cursor-pointer disabled:opacity-50"
          >
            Complete
          </button>
          <button
            disabled={bulkBusy}
            onClick={() => runBulk(() => bulkSetDone([...selectedIds], false))}
            className="hud-btn px-2 py-1 cursor-pointer disabled:opacity-50"
          >
            Incomplete
          </button>
          <select
            disabled={bulkBusy}
            defaultValue=""
            onChange={(e) => {
              const priority = e.target.value as Priority;
              e.target.value = '';
              if (priority) runBulk(() => bulkSetPriority([...selectedIds], priority));
            }}
            className="hud-input px-2 py-1 disabled:opacity-50"
          >
            <option value="" disabled>
              Set priority…
            </option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          {tags.length > 0 && (
            <select
              disabled={bulkBusy}
              defaultValue=""
              onChange={(e) => {
                const tagId = e.target.value;
                e.target.value = '';
                if (tagId) runBulk(() => bulkAddTag([...selectedIds], tagId));
              }}
              className="hud-input px-2 py-1 disabled:opacity-50"
            >
              <option value="" disabled>
                + Tag…
              </option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          )}
          <BulkActionsMenu items={bulkMenuItems} busy={bulkBusy} />
          <button
            disabled={bulkBusy}
            onClick={() => {
              if (confirm(`Archive ${selectedCount} quest${selectedCount === 1 ? '' : 's'}?`)) {
                runBulk(() => bulkArchive([...selectedIds]));
              }
            }}
            className="hud-btn px-2 py-1 cursor-pointer disabled:opacity-50"
          >
            Archive
          </button>
          <button
            disabled={bulkBusy}
            onClick={() => {
              if (confirm(`Delete ${selectedCount} quest${selectedCount === 1 ? '' : 's'}? This cannot be undone.`)) {
                runBulk(() => bulkDelete([...selectedIds]));
              }
            }}
            className="text-mist-dim hover:text-danger px-2 py-1 cursor-pointer disabled:opacity-50"
          >
            Delete
          </button>
          <button onClick={clearSelection} className="text-mist-dim hover:text-cyan-bright px-2 py-1 cursor-pointer ml-auto">
            Clear
          </button>
        </div>
      )}

      {lists.map((l) => (
        <ListSection
          key={l.id}
          list={l}
          canEdit={isMember}
          selectable={selecting}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
        />
      ))}

      {isMember && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newListName.trim()) return;
            addList(newListName.trim(), project.id).catch(() => {});
            setNewListName('');
          }}
          className="flex gap-2"
        >
          <input
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            placeholder="New list name..."
            className="hud-input flex-1 px-3 py-2 text-sm"
          />
          <button type="submit" className="hud-btn px-4 py-2 text-sm cursor-pointer">
            + Add List
          </button>
        </form>
      )}

      {managingFields && (
        <ManageFieldsModal projectId={project.id} onClose={() => setManagingFields(false)} />
      )}
      {managingStatuses && (
        <ManageStatusesModal projectId={project.id} onClose={() => setManagingStatuses(false)} />
      )}
      {managingAutomations && (
        <ManageAutomationsModal
          projectId={project.id}
          workspaceId={project.workspaceId}
          onClose={() => setManagingAutomations(false)}
        />
      )}
      {managingAccess && (
        <ManageProjectAccessModal projectId={project.id} onClose={() => setManagingAccess(false)} />
      )}
      {savingTemplate && (
        <SaveAsTemplateModal
          title="Save Project as Template"
          placeholder="e.g. Standard Dungeon Raid"
          onSave={(name) => projectTemplatesApi.saveFromProject(project.id, name).then(() => {})}
          onClose={() => setSavingTemplate(false)}
        />
      )}

      {bulkModal === 'assign' && (
        <BulkAssignModal
          workspaceId={project.workspaceId}
          onSubmit={(userId) => runNewBulk(() => bulkAssign([...selectedIds], userId))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'status' && (
        <BulkStatusModal
          projectId={project.id}
          onSubmit={(statusId) => runNewBulk(() => bulkSetStatus([...selectedIds], statusId))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'dates' && (
        <BulkDatesModal
          onSubmit={(patch) => runNewBulk(() => bulkSetDates([...selectedIds], patch))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'move' && (
        <BulkListPickerModal
          title="Move to List"
          submitLabel="Move"
          onSubmit={(listId) => runNewBulk(() => bulkMove([...selectedIds], listId))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'addToList' && (
        <BulkListPickerModal
          title="Add to List"
          submitLabel="Add"
          onSubmit={(listId) => runNewBulk(() => bulkCopyToList([...selectedIds], listId))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'convertToSubtask' && (
        <BulkTaskPickerModal
          title="Convert to Subtask"
          submitLabel="Convert"
          excludeIds={[...selectedIds]}
          onSubmit={(parentTaskId) => runNewBulk(() => bulkConvertToSubtask([...selectedIds], parentTaskId))}
          onClose={() => setBulkModal(null)}
        />
      )}
      {bulkModal === 'link' && (
        <BulkTaskPickerModal
          title="Link Tasks"
          submitLabel="Link"
          excludeIds={[...selectedIds]}
          showRelationType
          onSubmit={(targetTaskId, type) => runNewBulk(() => bulkLinkTasks([...selectedIds], targetTaskId, type!))}
          onClose={() => setBulkModal(null)}
        />
      )}
    </div>
  );
}
