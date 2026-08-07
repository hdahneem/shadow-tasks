import { describe, it, expect } from 'vitest';
import { BADGES, isBadgeEarned, nextLockedBadge } from './badges';

describe('badges', () => {
  it('defines three badges in ascending level order', () => {
    expect(BADGES).toHaveLength(3);
    const levels = BADGES.map((b) => b.levelRequired);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it('treats a badge as earned once the highest level reached meets its requirement', () => {
    const badge = BADGES[0];
    expect(isBadgeEarned(badge, badge.levelRequired - 1)).toBe(false);
    expect(isBadgeEarned(badge, badge.levelRequired)).toBe(true);
    expect(isBadgeEarned(badge, badge.levelRequired + 5)).toBe(true);
  });

  it('finds the next locked badge in order', () => {
    expect(nextLockedBadge(0)?.id).toBe(BADGES[0].id);
    expect(nextLockedBadge(BADGES[0].levelRequired)?.id).toBe(BADGES[1].id);
    expect(nextLockedBadge(BADGES[BADGES.length - 1].levelRequired)).toBeNull();
  });
});
