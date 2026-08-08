import { create } from 'zustand';
import { api, tokenStore, userCache, ApiError } from '../api/client';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface Session {
  id: string;
  device: string;
  createdAt: string;
  current: boolean;
}

interface AuthState {
  user: AuthUser | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;
  register: (email: string, password: string, name: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  clearError: () => void;
  updateName: (name: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  listSessions: () => Promise<Session[]>;
  revokeSession: (id: string) => Promise<void>;
  revokeOtherSessions: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  status: 'idle',
  error: null,

  clearError: () => set({ error: null }),

  register: async (email, password, name) => {
    set({ status: 'loading', error: null });
    try {
      const res = await api.post<{ user: AuthUser; accessToken: string; refreshToken: string }>(
        '/auth/register',
        { email, password, name },
        { skipAuth: true }
      );
      tokenStore.set(res.accessToken, res.refreshToken);
      userCache.set(res.user);
      set({ user: res.user, status: 'authenticated' });
    } catch (err) {
      set({ status: 'unauthenticated', error: describeAuthError(err) });
      throw err;
    }
  },

  login: async (email, password) => {
    set({ status: 'loading', error: null });
    try {
      const res = await api.post<{ user: AuthUser; accessToken: string; refreshToken: string }>(
        '/auth/login',
        { email, password },
        { skipAuth: true }
      );
      tokenStore.set(res.accessToken, res.refreshToken);
      userCache.set(res.user);
      set({ user: res.user, status: 'authenticated' });
    } catch (err) {
      set({ status: 'unauthenticated', error: describeAuthError(err) });
      throw err;
    }
  },

  logout: async () => {
    const refreshToken = tokenStore.refresh;
    tokenStore.clear();
    userCache.clear();
    set({ user: null, status: 'unauthenticated' });
    if (refreshToken) {
      api.post('/auth/logout', { refreshToken }, { skipAuth: true }).catch(() => {});
    }
  },

  hydrate: async () => {
    if (!tokenStore.access) {
      set({ status: 'unauthenticated' });
      return;
    }
    set({ status: 'loading' });
    try {
      const user = await api.get<AuthUser>('/auth/me');
      userCache.set(user);
      set({ user, status: 'authenticated' });
    } catch (err) {
      // A raw (non-ApiError) failure means the request never reached the server —
      // most likely no connectivity — not that the token is actually invalid.
      // Stay signed in against the last-known user so a cold start while offline
      // can still render cached data instead of bouncing to the login screen.
      if (!(err instanceof ApiError)) {
        const cached = userCache.get<AuthUser>();
        if (cached) {
          set({ user: cached, status: 'authenticated' });
          return;
        }
      }
      tokenStore.clear();
      userCache.clear();
      set({ user: null, status: 'unauthenticated' });
    }
  },

  updateName: async (name) => {
    const user = await api.patch<AuthUser>('/auth/me', { name });
    userCache.set(user);
    set({ user });
  },

  changePassword: async (currentPassword, newPassword) => {
    await api.post('/auth/change-password', { currentPassword, newPassword });
  },

  forgotPassword: async (email) => {
    await api.post('/auth/forgot-password', { email }, { skipAuth: true });
  },

  resetPassword: async (token, newPassword) => {
    await api.post('/auth/reset-password', { token, newPassword }, { skipAuth: true });
  },

  deleteAccount: async (password) => {
    await api.delete('/auth/me', { password });
    tokenStore.clear();
    userCache.clear();
    set({ user: null, status: 'unauthenticated' });
  },

  listSessions: () => {
    const headers = tokenStore.refresh ? { 'X-Refresh-Token': tokenStore.refresh } : undefined;
    return api.get<Session[]>('/auth/sessions', { headers });
  },

  revokeSession: async (id) => {
    await api.delete(`/auth/sessions/${id}`);
  },

  revokeOtherSessions: async () => {
    if (!tokenStore.refresh) return;
    await api.post('/auth/sessions/revoke-others', { currentRefreshToken: tokenStore.refresh });
  },
}));

function describeAuthError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409) return 'An account with this email already exists.';
    if (err.status === 401) return 'Incorrect email or password.';
    if (err.status === 400) return 'Please check your details and try again.';
  }
  return 'Something went wrong. Please try again.';
}
