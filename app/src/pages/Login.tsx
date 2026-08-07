import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { useAuthStore } from '../store/useAuthStore';

export function Login() {
  const login = useAuthStore((s) => s.login);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch {
      // error is surfaced via the store's `error` field
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
            Hunter Login
          </h2>
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
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="block font-body text-xs tracking-widest uppercase text-mist">
                  Password
                </label>
                <Link to="/forgot-password" className="text-[11px] text-cyan-dim hover:text-cyan-bright">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="hud-input w-full px-3 py-2 text-sm"
              />
            </div>
            {error && <p className="text-danger text-sm">{error}</p>}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="hud-btn hud-btn-solid py-2.5 mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
          <p className="text-center text-sm text-mist mt-5">
            New Hunter?{' '}
            <Link to="/register" className="text-cyan-bright hover:text-cyan-dim">
              Create an account
            </Link>
          </p>
        </Panel>
      </div>
    </div>
  );
}
