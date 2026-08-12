import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveAssetUrl, errorMessage, ApiError, api } from './client';
import { useConnectionStore } from '../store/useConnectionStore';

describe('resolveAssetUrl', () => {
  it('resolves a server-relative upload path against the API origin', () => {
    expect(resolveAssetUrl('/uploads/abc.png')).toBe('http://localhost:4000/uploads/abc.png');
  });

  it('leaves an already-absolute URL untouched', () => {
    expect(resolveAssetUrl('https://cdn.example.com/foo.png')).toBe('https://cdn.example.com/foo.png');
    expect(resolveAssetUrl('http://example.com/bar.jpg')).toBe('http://example.com/bar.jpg');
  });
});

describe('errorMessage', () => {
  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('uses the ApiError message regardless of connectivity', () => {
    expect(errorMessage(new ApiError(500, 'Server exploded'), 'fallback')).toBe('Server exploded');
  });

  it('falls back to the generic message for a non-ApiError failure while online', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    expect(errorMessage(new TypeError('Failed to fetch'), 'Could not save.')).toBe('Could not save.');
  });

  it('reports an offline-specific message for a non-ApiError failure while offline', () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    expect(errorMessage(new TypeError('Failed to fetch'), 'Could not save.')).toBe(
      "You're offline — this needs a connection."
    );
  });

  it('uses the default fallback text when none is given', () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});

describe('connection reporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('records which backend candidate a successful request went through', async () => {
    // VITE_API_URL / VITE_API_URL_USB are unset in the test env, so both
    // default to the same localhost origin and collapse into one 'wifi'
    // candidate (see connectionCandidates.test.ts for the dedup logic itself).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await api.get('/health', { skipAuth: true });
    expect(useConnectionStore.getState().connectionType).toBe('wifi');
  });
});
