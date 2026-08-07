import { useMemo, useState } from 'react';
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
import { projectTemplatesApi } from '../api/services';
import { RANKS, type Rank } from '../types';

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
  const [newListName, setNewListName] = useState('');
  const [managingFields, setManagingFields] = useState(false);
  const [managingStatuses, setManagingStatuses] = useState(false);
  const [managingAutomations, setManagingAutomations] = useState(false);
  const [managingAccess, setManagingAccess] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const role = project?.effectiveRole;
  const isAdmin = role === 'admin' || role === 'owner';
  const isMember = isAdmin || role === 'member';

  if (!project) {
    return (
      <div className="max-w-3xl mx-auto animate-flicker-in">
        <p className="text-mist-dim text-sm">Project not found.</p>
      </div>
    );
  }

  const listIds = lists.map((l) => l.id);
  const projectTasks = tasks.filter((t) => listIds.includes(t.listId));
  const done = projectTasks.filter((t) => t.done).length;

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

      {lists.map((l) => (
        <ListSection key={l.id} list={l} canEdit={isMember} />
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
    </div>
  );
}
