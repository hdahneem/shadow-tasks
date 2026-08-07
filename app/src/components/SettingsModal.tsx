import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { useAuthStore, type Session } from '../store/useAuthStore';
import { ApiError } from '../api/client';

function formatSessionDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const updateName = useAuthStore((s) => s.updateName);
  const changePassword = useAuthStore((s) => s.changePassword);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const listSessions = useAuthStore((s) => s.listSessions);
  const revokeSession = useAuthStore((s) => s.revokeSession);
  const revokeOtherSessions = useAuthStore((s) => s.revokeOtherSessions);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);

  const refetchSessions = () => listSessions().then(setSessions);

  useEffect(() => {
    refetchSessions().finally(() => setSessionsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRevoke = async (session: Session) => {
    if (session.current && !confirm('This is your current device. Revoking it will sign you out. Continue?')) {
      return;
    }
    setRevokingId(session.id);
    setSessionsError(null);
    try {
      await revokeSession(session.id);
      if (session.current) {
        useAuthStore.getState().logout();
        return;
      }
      await refetchSessions();
    } catch {
      setSessionsError('Could not revoke that session. Please try again.');
    } finally {
      setRevokingId(null);
    }
  };

  const handleRevokeOthers = async () => {
    if (!confirm('Sign out every other device? This device stays signed in.')) return;
    setRevokingOthers(true);
    setSessionsError(null);
    try {
      await revokeOtherSessions();
      await refetchSessions();
    } catch {
      setSessionsError('Could not sign out other devices. Please try again.');
    } finally {
      setRevokingOthers(false);
    }
  };

  const [name, setName] = useState(user?.name ?? '');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSaved, setNameSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const submitName = async () => {
    if (!name.trim() || nameSaving) return;
    setNameSaving(true);
    setNameError(null);
    setNameSaved(false);
    try {
      await updateName(name.trim());
      setNameSaved(true);
    } catch {
      setNameError('Could not update your name. Please try again.');
    } finally {
      setNameSaving(false);
    }
  };

  const submitPassword = async () => {
    if (passwordSaving) return;
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setPasswordSaving(true);
    setPasswordError(null);
    setPasswordSaved(false);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordSaved(true);
    } catch (err) {
      setPasswordError(
        err instanceof ApiError && err.status === 401
          ? 'Current password is incorrect.'
          : 'Could not change your password. Please try again.'
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const submitDelete = async () => {
    if (deleting || deleteConfirmText !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccount(deletePassword);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.status === 401
            ? 'Incorrect password.'
            : err.message
          : 'Could not delete your account. Please try again.'
      );
      setDeleting(false);
    }
  };

  return (
    <Modal title="Hunter Settings" onClose={onClose}>
      <div className="flex flex-col gap-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitName();
          }}
          className="flex flex-col gap-3"
        >
          <div>
            <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
              Display Name
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameSaved(false);
              }}
              className="hud-input w-full px-3 py-2 text-sm"
            />
          </div>
          {nameError && <p className="text-danger text-sm">{nameError}</p>}
          {nameSaved && !nameError && <p className="text-cyan-bright text-sm">Name updated.</p>}
          <button
            type="submit"
            disabled={nameSaving || !name.trim()}
            className="hud-btn hud-btn-solid py-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {nameSaving ? 'Saving…' : 'Save Name'}
          </button>
        </form>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitPassword();
          }}
          className="flex flex-col gap-3 pt-4 border-t border-cyan-dim/15"
        >
          <label className="block font-body text-xs tracking-widest uppercase text-mist -mb-1">
            Change Password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => {
              setCurrentPassword(e.target.value);
              setPasswordSaved(false);
            }}
            placeholder="Current password"
            className="hud-input w-full px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={newPassword}
            onChange={(e) => {
              setNewPassword(e.target.value);
              setPasswordSaved(false);
            }}
            placeholder="New password"
            className="hud-input w-full px-3 py-2 text-sm"
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              setPasswordSaved(false);
            }}
            placeholder="Confirm new password"
            className="hud-input w-full px-3 py-2 text-sm"
          />
          {passwordError && <p className="text-danger text-sm">{passwordError}</p>}
          {passwordSaved && !passwordError && (
            <p className="text-cyan-bright text-sm">Password changed.</p>
          )}
          <button
            type="submit"
            disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}
            className="hud-btn hud-btn-solid py-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {passwordSaving ? 'Changing…' : 'Change Password'}
          </button>
        </form>

        <div className="pt-4 border-t border-cyan-dim/15">
          <label className="block font-body text-xs tracking-widest uppercase text-mist mb-2">
            Active Sessions
          </label>
          {sessionsError && <p className="text-danger text-sm mb-2">{sessionsError}</p>}
          {sessionsLoading ? (
            <p className="text-mist-dim text-sm">Loading…</p>
          ) : (
            <div className="flex flex-col gap-1.5 mb-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-2 border border-cyan-dim/20 px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate flex items-center gap-2">
                      {session.device}
                      {session.current && (
                        <span className="text-[10px] px-1.5 py-0.5 border border-cyan-dim/40 text-cyan-bright uppercase tracking-wide shrink-0">
                          This device
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-mist-dim">Signed in {formatSessionDate(session.createdAt)}</div>
                  </div>
                  <button
                    onClick={() => handleRevoke(session)}
                    disabled={revokingId === session.id}
                    className="text-mist-dim hover:text-danger text-xs cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
          {sessions.length > 1 && (
            <button
              onClick={handleRevokeOthers}
              disabled={revokingOthers}
              className="hud-btn text-xs px-3 py-1.5 cursor-pointer disabled:opacity-50"
            >
              {revokingOthers ? 'Signing out…' : 'Sign Out Other Devices'}
            </button>
          )}
        </div>

        <div className="pt-4 border-t border-danger/30">
          <label className="block font-body text-xs tracking-widest uppercase text-danger mb-2">
            Danger Zone
          </label>
          {!deleteOpen ? (
            <button
              onClick={() => setDeleteOpen(true)}
              className="hud-btn text-xs px-3 py-1.5 cursor-pointer text-danger border-danger/40"
            >
              Delete Account
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitDelete();
              }}
              className="flex flex-col gap-3"
            >
              <p className="text-mist text-sm">
                This permanently deletes your account and everything tied only to you. This cannot be undone.
              </p>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Your password"
                className="hud-input w-full px-3 py-2 text-sm"
              />
              <div>
                <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
                  Type DELETE to confirm
                </label>
                <input
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="DELETE"
                  className="hud-input w-full px-3 py-2 text-sm"
                />
              </div>
              {deleteError && <p className="text-danger text-sm">{deleteError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeletePassword('');
                    setDeleteConfirmText('');
                    setDeleteError(null);
                  }}
                  className="hud-btn text-xs px-3 py-2 cursor-pointer flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleting || !deletePassword || deleteConfirmText !== 'DELETE'}
                  className="hud-btn text-xs px-3 py-2 cursor-pointer text-danger border-danger/40 flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? 'Deleting…' : 'Permanently Delete'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Modal>
  );
}
