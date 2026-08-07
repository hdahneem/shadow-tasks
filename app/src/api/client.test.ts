import { describe, it, expect } from 'vitest';
import { resolveAssetUrl } from './client';

describe('resolveAssetUrl', () => {
  it('resolves a server-relative upload path against the API origin', () => {
    expect(resolveAssetUrl('/uploads/abc.png')).toBe('http://localhost:4000/uploads/abc.png');
  });

  it('leaves an already-absolute URL untouched', () => {
    expect(resolveAssetUrl('https://cdn.example.com/foo.png')).toBe('https://cdn.example.com/foo.png');
    expect(resolveAssetUrl('http://example.com/bar.jpg')).toBe('http://example.com/bar.jpg');
  });
});
