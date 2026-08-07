import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { useAuthStore } from '../store/useAuthStore';

export function ResetPassword() {
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !token) return;
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
    } catch {
      setError('This reset link is invalid or has expired. Request a new one.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="hud-grid min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm animate-flicker-in">
        <div className="flex items-center gap-2 justify-center mb-6">
          <span className="w-2 h-2 bg-cyan rounded-full shadow-[0_0_8px_2px_rgba(34,211,238,0.8)]" />
          <h1 className="font-display font-bold tracking-[0.2em] text-sm text-glow-cyan uppercase">
            Shadow Tasks
          </h1>
        </div>
        <Panel className="p-6">
          <h2 className="font-display font-bold uppercase tracking-widest text-lg text-glow-cyan mb-5">
            Choose New Password
          </h2>

          {!token ? (
            <p className="text-danger text-sm">
              This link is missing its reset token.{' '}
              <Link to="/forgot-password" className="text-cyan-bright hover:underline">
                Request a new one
              </Link>
              .
            </p>
          ) : done ? (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-mist">Your password has been reset.</p>
              <button
                onClick={() => navigate('/login')}
                className="hud-btn hud-btn-solid py-2.5 cursor-pointer"
              >
                Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <label htmlFor="new-password" className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
                  New Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoFocus
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="hud-input w-full px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="confirm-password" className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
                  Confirm New Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="hud-input w-full px-3 py-2 text-sm"
                />
              </div>
              {error && <p className="text-danger text-sm">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="hud-btn hud-btn-solid py-2.5 mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Resetting…' : 'Reset Password'}
              </button>
            </form>
          )}

          <p className="text-center text-sm text-mist mt-5">
            <Link to="/login" className="text-cyan-bright hover:text-cyan-dim">
              ← Back to Sign In
            </Link>
          </p>
        </Panel>
      </div>
    </div>
  );
}
