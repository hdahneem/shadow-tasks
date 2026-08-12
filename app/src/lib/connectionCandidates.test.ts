import { describe, it, expect } from 'vitest';
import { buildCandidates, orderCandidates, type Candidate } from './connectionCandidates';

describe('buildCandidates', () => {
  it('keeps both candidates when they resolve to different origins', () => {
    const candidates = buildCandidates([
      { url: 'http://10.0.0.5:4000/api/v1', type: 'wifi' },
      { url: 'http://localhost:4000/api/v1', type: 'usb' },
    ]);
    expect(candidates).toHaveLength(2);
    expect(candidates.map((c) => c.type)).toEqual(['wifi', 'usb']);
    expect(candidates.every((c) => c.lastFailedAt === null)).toBe(true);
  });

  it('collapses candidates that resolve to the same origin (e.g. desktop dev)', () => {
    const candidates = buildCandidates([
      { url: 'http://localhost:4000/api/v1', type: 'wifi' },
      { url: 'http://localhost:4000/api/v1', type: 'usb' },
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].type).toBe('wifi'); // first one wins
  });

  it('computes origin separately from the full path-bearing url', () => {
    const [candidate] = buildCandidates([{ url: 'http://10.0.0.5:4000/api/v1', type: 'wifi' }]);
    expect(candidate.origin).toBe('http://10.0.0.5:4000');
    expect(candidate.url).toBe('http://10.0.0.5:4000/api/v1');
  });
});

describe('orderCandidates', () => {
  const wifi: Candidate = { url: 'http://wifi', origin: 'http://wifi', type: 'wifi', lastFailedAt: null };
  const usb: Candidate = { url: 'http://usb', origin: 'http://usb', type: 'usb', lastFailedAt: null };

  it('keeps original order when nothing has failed', () => {
    expect(orderCandidates([wifi, usb], 1000, 10_000)).toEqual([wifi, usb]);
  });

  it('demotes a candidate that failed recently, within the cooldown window', () => {
    const failedWifi = { ...wifi, lastFailedAt: 900 };
    expect(orderCandidates([failedWifi, usb], 1000, 10_000)).toEqual([usb, failedWifi]);
  });

  it('restores a candidate to its original priority once the cooldown has elapsed', () => {
    const failedWifi = { ...wifi, lastFailedAt: 900 };
    expect(orderCandidates([failedWifi, usb], 900 + 10_001, 10_000)).toEqual([failedWifi, usb]);
  });

  it('keeps relative order among multiple recently-failed candidates', () => {
    const failedWifi = { ...wifi, lastFailedAt: 950 };
    const failedUsb = { ...usb, lastFailedAt: 950 };
    expect(orderCandidates([failedWifi, failedUsb], 1000, 10_000)).toEqual([failedWifi, failedUsb]);
  });
});
