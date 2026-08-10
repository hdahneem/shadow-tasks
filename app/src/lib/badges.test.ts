import { describe, it, expect } from 'vitest';
import { BADGES, isBadgeEarned, nextLockedBadge, newlyUnlockedBadges } from './badges';

describe('badges', () => {
  it('defines eight badges in ascending level order', () => {
    expect(BADGES).toHaveLength(8);
    const levels = BADGES.map((b) => b.levelRequired);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it('lines the five rank badges up with the D/C/B/A/S level thresholds, then three prestige badges beyond S-Rank', () => {
    expect(BADGES.map((b) => b.levelRequired)).toEqual([10, 20, 30, 40, 50, 65, 80, 100]);
    expect(BADGES.map((b) => b.rank)).toEqual(['D', 'C', 'B', 'A', 'S', 'S', 'S', 'S']);
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

  describe('newlyUnlockedBadges', () => {
    it('returns nothing when the peak level has not moved', () => {
      expect(newlyUnlockedBadges(25, 25)).toEqual([]);
      expect(newlyUnlockedBadges(25, 20)).toEqual([]);
    });

    it('returns badges whose requirement falls in the (previous, new] range', () => {
      expect(newlyUnlockedBadges(0, 10).map((b) => b.id)).toEqual(['d-rank']);
      expect(newlyUnlockedBadges(9, 10).map((b) => b.id)).toEqual(['d-rank']);
      expect(newlyUnlockedBadges(15, 45).map((b) => b.id)).toEqual(['c-rank', 'b-rank', 'a-rank']);
    });

    it('does not re-report a badge whose requirement is at or before the previous peak', () => {
      expect(newlyUnlockedBadges(10, 15)).toEqual([]);
    });
  });
});
