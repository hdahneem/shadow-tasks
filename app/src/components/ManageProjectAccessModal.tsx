import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { projectsApi } from '../api/services';
import type { ProjectMemberAccess, WorkspaceRole } from '../types';

const OVERRIDABLE_ROLES: WorkspaceRole[] = ['viewer', 'member', 'admin'];
const INHERIT = 'inherit';

export function ManageProjectAccessModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const [members, setMembers] = useState<ProjectMemberAccess[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = () => projectsApi.members(projectId).then(setMembers);

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const changeOverride = async (userId: string, value: string) => {
    setError(null);
    try {
      if (value === INHERIT) {
        await projectsApi.removeMemberOverride(projectId, userId);
      } else {
        await projectsApi.setMemberRole(projectId, userId, value as WorkspaceRole);
      }
      refetch();
    } catch {
      setError('Could not update that hunter\'s access to this quest line.');
    }
  };

  return (
    <Modal title="Quest Line Access" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-mist-dim">
          Override a hunter's workspace role for this project only. Everyone else keeps their normal workspace
          access.
        </p>

        <div className="flex flex-col gap-1.5">
          {members?.map((m) => (
            <div key={m.userId} className="flex items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <span className="text-mist truncate">{m.user.name}</span>
                <span className="text-mist-dim text-xs ml-1.5">{m.user.email}</span>
              </div>
              <select
                value={m.overrideRole ?? INHERIT}
                onChange={(e) => changeOverride(m.userId, e.target.value)}
                className="hud-input px-1.5 py-0.5 text-xs capitalize shrink-0"
              >
                <option value={INHERIT}>Inherit ({m.workspaceRole})</option>
                {OVERRIDABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {members?.length === 0 && <p className="text-mist-dim text-sm">No workspace members yet.</p>}
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}
      </div>
    </Modal>
  );
}
