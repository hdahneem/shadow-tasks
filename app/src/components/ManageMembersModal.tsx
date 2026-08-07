import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { workspacesApi } from '../api/services';
import type { WorkspaceMember, WorkspaceInvite, WorkspaceRole } from '../types';

const ASSIGNABLE_ROLES: WorkspaceRole[] = ['viewer', 'member', 'admin'];
const INVITE_ROLES: WorkspaceRole[] = ['viewer', 'member', 'admin'];

export function ManageMembersModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const workspace = useStore((s) => s.workspaces.find((w) => w.id === workspaceId));
  const renameWorkspace = useStore((s) => s.renameWorkspace);
  const currentUser = useAuthStore((s) => s.user);
  const actorRole = workspace?.role;
  const isAdmin = actorRole === 'admin' || actorRole === 'owner';

  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [nameDraft, setNameDraft] = useState(workspace?.name ?? '');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member');
  const [error, setError] = useState<string | null>(null);

  const refetch = () => {
    workspacesApi.members(workspaceId).then(setMembers);
    if (isAdmin) workspacesApi.invites(workspaceId).then(setInvites);
  };

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  const submitInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setError(null);
    try {
      await workspacesApi.invite(workspaceId, inviteEmail.trim(), inviteRole);
      setInviteEmail('');
      refetch();
    } catch {
      setError('Could not send that invite. Please check the email and try again.');
    }
  };

  const changeRole = async (userId: string, role: WorkspaceRole) => {
    setError(null);
    try {
      await workspacesApi.changeMemberRole(workspaceId, userId, role);
      refetch();
    } catch {
      setError('Could not change that member\'s role.');
    }
  };

  const removeMember = async (userId: string) => {
    if (!confirm('Remove this member from the workspace?')) return;
    setError(null);
    try {
      await workspacesApi.removeMember(workspaceId, userId);
      refetch();
    } catch {
      setError('Could not remove that member.');
    }
  };

  const revokeInvite = async (inviteId: string) => {
    await workspacesApi.revokeInvite(workspaceId, inviteId);
    refetch();
  };

  if (!workspace) return null;

  return (
    <Modal title="Manage Workspace" onClose={onClose}>
      <div className="flex flex-col gap-5">
        <div>
          <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
            Workspace Name
          </label>
          {isAdmin ? (
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => {
                if (nameDraft.trim() && nameDraft !== workspace.name)
                  renameWorkspace(workspace.id, nameDraft.trim()).catch(() => {});
              }}
              className="hud-input w-full px-3 py-2 text-sm"
            />
          ) : (
            <p className="text-sm text-mist">{workspace.name}</p>
          )}
        </div>

        <div>
          <h3 className="font-display text-xs tracking-widest uppercase text-mist mb-2">Members</h3>
          <div className="flex flex-col gap-1.5">
            {members?.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <span className="text-mist truncate">{m.user.name}</span>
                  <span className="text-mist-dim text-xs ml-1.5">{m.user.email}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin ? (
                    <select
                      value={m.role}
                      onChange={(e) => changeRole(m.user.id, e.target.value as WorkspaceRole)}
                      disabled={m.role === 'owner' && actorRole !== 'owner'}
                      className="hud-input px-1.5 py-0.5 text-xs capitalize"
                    >
                      {(actorRole === 'owner' ? [...ASSIGNABLE_ROLES, 'owner'] : ASSIGNABLE_ROLES).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-mist-dim text-xs capitalize">{m.role}</span>
                  )}
                  {(isAdmin || m.user.id === currentUser?.id) && (
                    <button
                      onClick={() => removeMember(m.user.id)}
                      className="text-mist-dim hover:text-danger text-xs cursor-pointer"
                      title={m.user.id === currentUser?.id ? 'Leave workspace' : 'Remove member'}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {isAdmin && (
          <>
            {invites.length > 0 && (
              <div>
                <h3 className="font-display text-xs tracking-widest uppercase text-mist mb-2">Pending Invites</h3>
                <div className="flex flex-col gap-1.5">
                  {invites.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="text-mist truncate">
                        {inv.email} <span className="text-mist-dim text-xs capitalize">({inv.role})</span>
                      </span>
                      <button
                        onClick={() => revokeInvite(inv.id)}
                        className="text-mist-dim hover:text-danger text-xs cursor-pointer shrink-0"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h3 className="font-display text-xs tracking-widest uppercase text-mist mb-2">Invite a Hunter</h3>
              <form onSubmit={submitInvite} className="flex gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="hud-input flex-1 px-3 py-1.5 text-sm min-w-0"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                  className="hud-input px-2 py-1.5 text-xs capitalize"
                >
                  {INVITE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                <button type="submit" className="hud-btn text-xs px-3 py-1.5 cursor-pointer shrink-0">
                  Invite
                </button>
              </form>
            </div>
          </>
        )}

        {error && <p className="text-danger text-sm">{error}</p>}
      </div>
    </Modal>
  );
}
