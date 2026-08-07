import { useState } from 'react';
import { useStore } from '../store/useStore';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';
import { ManageMembersModal } from './ManageMembersModal';

export function WorkspaceSwitcher() {
  const workspaces = useStore((s) => s.workspaces);
  const currentWorkspaceId = useStore((s) => s.currentWorkspaceId);
  const setCurrentWorkspace = useStore((s) => s.setCurrentWorkspace);
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState(false);

  const current = workspaces.find((w) => w.id === currentWorkspaceId);

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={currentWorkspaceId ?? ''}
        onChange={(e) => setCurrentWorkspace(e.target.value)}
        className="hud-input flex-1 min-w-0 px-2 py-1.5 text-xs"
        aria-label="Active workspace"
      >
        {workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      {current && (
        <button
          onClick={() => setManaging(true)}
          className="shrink-0 w-7 h-7 flex items-center justify-center text-cyan-dim hover:text-cyan-bright text-xs border border-cyan-dim/30 hover:border-cyan-dim/60 cursor-pointer"
          title="Manage workspace members"
        >
          ⚙
        </button>
      )}
      <button
        onClick={() => setCreating(true)}
        className="shrink-0 w-7 h-7 flex items-center justify-center text-cyan-dim hover:text-cyan-bright text-sm border border-cyan-dim/30 hover:border-cyan-dim/60 cursor-pointer"
        title="New workspace"
      >
        +
      </button>

      {creating && <CreateWorkspaceModal onClose={() => setCreating(false)} />}
      {managing && current && <ManageMembersModal workspaceId={current.id} onClose={() => setManaging(false)} />}
    </div>
  );
}
