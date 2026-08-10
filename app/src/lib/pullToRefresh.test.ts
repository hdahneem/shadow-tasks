import { describe, it, expect } from 'vitest';
import {
  toVisualPull,
  shouldEngage,
  isReadyToRelease,
  MAX_VISUAL_PULL,
  RELEASE_THRESHOLD,
  RESISTANCE,
} from './pullToRefresh';

describe('toVisualPull', () => {
  it('applies resistance to a downward drag', () => {
    expect(toVisualPull(100)).toBe(100 * RESISTANCE);
  });

  it('is zero for an upward or zero drag', () => {
    expect(toVisualPull(0)).toBe(0);
    expect(toVisualPull(-50)).toBe(0);
  });

  it('caps at MAX_VISUAL_PULL for a very long drag', () => {
    expect(toVisualPull(10_000)).toBe(MAX_VISUAL_PULL);
  });
});

describe('shouldEngage', () => {
  it('engages for a predominantly-downward drag at the top of the scroll container', () => {
    expect(shouldEngage(0, 30, 0)).toBe(true);
  });

  it('does not engage when the container is already scrolled down', () => {
    expect(shouldEngage(0, 30, 5)).toBe(false);
  });

  it('does not engage for a horizontal swipe (e.g. the Kanban board)', () => {
    expect(shouldEngage(40, 10, 0)).toBe(false);
  });

  it('does not engage for an upward drag', () => {
    expect(shouldEngage(0, -30, 0)).toBe(false);
  });

  it('does not engage for a tiny movement within the dead zone', () => {
    expect(shouldEngage(0, 3, 0)).toBe(false);
  });
});

describe('isReadyToRelease', () => {
  it('is false below the release threshold', () => {
    expect(isReadyToRelease(RELEASE_THRESHOLD - 1)).toBe(false);
  });

  it('is true at or above the release threshold', () => {
    expect(isReadyToRelease(RELEASE_THRESHOLD)).toBe(true);
    expect(isReadyToRelease(MAX_VISUAL_PULL)).toBe(true);
  });
});
