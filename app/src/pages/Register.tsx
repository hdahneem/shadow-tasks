import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Panel } from '../components/Panel';
import { useAuthStore } from '../store/useAuthStore';

export function Register() {
  const register = useAuthStore((s) => s.register);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(email, password, name);
      navigate('/', { replace: true });
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
            Awaken as a Hunter
          </h2>
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
                Name
              </label>
              <input
                autoFocus
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="hud-input w-full px-3 py-2 text-sm"
                placeholder="Sung Jin-Woo"
              />
            </div>
            <div>
              <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="hud-input w-full px-3 py-2 text-sm"
                placeholder="hunter@association.gov"
              />
            </div>
            <div>
              <label className="block font-body text-xs tracking-widest uppercase text-mist mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="hud-input w-full px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-mist-dim mt-1">At least 8 characters.</p>
            </div>
            {error && <p className="text-danger text-sm">{error}</p>}
            <button
              type="submit"
              disabled={status === 'loading'}
              className="hud-btn hud-btn-solid py-2.5 mt-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === 'loading' ? 'Awakening…' : 'Create Account'}
            </button>
          </form>
          <p className="text-center text-sm text-mist mt-5">
            Already a Hunter?{' '}
            <Link to="/login" className="text-cyan-bright hover:text-cyan-dim">
              Sign in
            </Link>
          </p>
        </Panel>
      </div>
    </div>
  );
}
