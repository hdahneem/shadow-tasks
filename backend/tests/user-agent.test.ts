import { describe, it, expect } from 'vitest';
import { parseUserAgent } from '../src/lib/userAgent.js';

describe('parseUserAgent', () => {
  it('identifies Chrome on macOS', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      )
    ).toBe('Chrome on macOS');
  });

  it('identifies Safari on iOS', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      )
    ).toBe('Safari on iOS');
  });

  it('identifies Firefox on Windows', () => {
    expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0')).toBe(
      'Firefox on Windows'
    );
  });

  it('identifies Edge distinctly from Chrome', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
      )
    ).toBe('Edge on Windows');
  });

  it('identifies Chrome on Android', () => {
    expect(
      parseUserAgent(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      )
    ).toBe('Chrome on Android');
  });

  it('falls back to "Unknown device" when there is no User-Agent', () => {
    expect(parseUserAgent(undefined)).toBe('Unknown device');
    expect(parseUserAgent(null)).toBe('Unknown device');
    expect(parseUserAgent('')).toBe('Unknown device');
  });

  it('falls back to "Unknown device" for a completely unrecognizable string', () => {
    expect(parseUserAgent('some-custom-http-client/1.0')).toBe('Unknown device');
  });
});
