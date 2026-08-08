import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() } };
});

describe('useAuthStore hydrate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('signs out when there is no access token', async () => {
    const { useAuthStore } = await import('./useAuthStore');
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().status).toBe('unauthenticated');
  });

  it('authenticates from a fresh /auth/me response and caches the user', async () => {
    const { api, tokenStore, userCache } = await import('../api/client');
    const { useAuthStore } = await import('./useAuthStore');

    tokenStore.set('access-1', 'refresh-1');
    const user = { id: 'u1', email: 'hunter@example.com', name: 'Hunter' };
    vi.mocked(api.get).mockResolvedValue(user);

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(user);
    expect(userCache.get()).toEqual(user);
  });

  it('clears tokens and signs out when /auth/me rejects with a real ApiError', async () => {
    const { api, tokenStore, ApiError } = await import('../api/client');
    const { useAuthStore } = await import('./useAuthStore');

    tokenStore.set('access-1', 'refresh-1');
    vi.mocked(api.get).mockRejectedValue(new ApiError(401, 'Session expired'));

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(useAuthStore.getState().user).toBeNull();
    expect(tokenStore.access).toBeNull();
  });

  it('stays authenticated from the cached user when /auth/me fails with a network error', async () => {
    // Regression: navigator.onLine is unreliable on some WebViews, so a cold
    // start while genuinely offline still attempts /auth/me and gets a raw
    // fetch failure (not an ApiError). That must not log the hunter out.
    const { api, tokenStore, userCache } = await import('../api/client');
    const { useAuthStore } = await import('./useAuthStore');

    tokenStore.set('access-1', 'refresh-1');
    const cachedUser = { id: 'u1', email: 'hunter@example.com', name: 'Hunter' };
    userCache.set(cachedUser);
    vi.mocked(api.get).mockRejectedValue(new TypeError('Failed to fetch'));

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().status).toBe('authenticated');
    expect(useAuthStore.getState().user).toEqual(cachedUser);
    expect(tokenStore.access).toBe('access-1');
  });

  it('signs out on a network error when there is no cached user to fall back to', async () => {
    const { api, tokenStore } = await import('../api/client');
    const { useAuthStore } = await import('./useAuthStore');

    tokenStore.set('access-1', 'refresh-1');
    vi.mocked(api.get).mockRejectedValue(new TypeError('Failed to fetch'));

    await useAuthStore.getState().hydrate();

    expect(useAuthStore.getState().status).toBe('unauthenticated');
    expect(tokenStore.access).toBeNull();
  });
});
