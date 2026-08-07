import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { useAuthStore } from '../store/useAuthStore';

export function ForgotPassword() {
  const forgotPassword = useAuthStore((s) => s.forgotPassword);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
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
            Reset Password
          </h2>

          {sent ? (
            <p className="text-sm text-mist">
              If an account exists for <span className="text-cyan-bright">{email}</span>, a reset link has
              been sent. Check your inbox.
            </p>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="hud-input w-full px-3 py-2 text-sm"
                  placeholder="hunter@association.gov"
                />
              </div>
              {error && <p className="text-danger text-sm">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="hud-btn hud-btn-solid py-2.5 mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending…' : 'Send Reset Link'}
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
