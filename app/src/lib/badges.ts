import type { Rank } from '../types';
import dRankImage from '../assets/badges/d-rank.jpg';
import cRankImage from '../assets/badges/c-rank.jpg';
import bRankImage from '../assets/badges/b-rank.jpg';
import aRankImage from '../assets/badges/a-rank.jpg';
import sRankImage from '../assets/badges/s-rank.jpg';
import epicImage from '../assets/badges/epic.jpg';
import legendaryImage from '../assets/badges/legendary.jpg';
import mythicImage from '../assets/badges/mythic.jpg';

export interface BadgeDefinition {
  id: string;
  name: string;
  description: string;
  levelRequired: number;
  rank: Rank;
  image: string;
}

// Levels 10/20/30/40/50 line up exactly with rankForLevel's D/C/B/A/S thresholds
// (see useStore.ts) — these five badges mark ordinary rank-ups. The last three
// sit beyond S-Rank, the ceiling of the Rank type: prestige achievements for a
// hunter who has already maxed out the rank system and keeps pushing further.
export const BADGES: BadgeDefinition[] = [
  {
    id: 'd-rank',
    name: 'D-Rank Vanguard',
    description: 'Reached Level 10, breaking into D-Rank.',
    levelRequired: 10,
    rank: 'D',
    image: dRankImage,
  },
  {
    id: 'c-rank',
    name: 'C-Rank Sentinel',
    description: 'Reached Level 20, breaking into C-Rank.',
    levelRequired: 20,
    rank: 'C',
    image: cRankImage,
  },
  {
    id: 'b-rank',
    name: 'B-Rank Warbringer',
    description: 'Reached Level 30, breaking into B-Rank.',
    levelRequired: 30,
    rank: 'B',
    image: bRankImage,
  },
  {
    id: 'a-rank',
    name: 'A-Rank Dreadnought',
    description: 'Reached Level 40, breaking into A-Rank.',
    levelRequired: 40,
    rank: 'A',
    image: aRankImage,
  },
  {
    id: 's-rank',
    name: 'S-Rank Sovereign',
    description: 'Reached Level 50, breaking into S-Rank — the peak of ordinary power.',
    levelRequired: 50,
    rank: 'S',
    image: sRankImage,
  },
  {
    id: 'epic',
    name: 'Epic Ascendant',
    description: 'Reached Level 65, surpassing the limits of S-Rank.',
    levelRequired: 65,
    rank: 'S',
    image: epicImage,
  },
  {
    id: 'legendary',
    name: 'Legendary Hunter',
    description: 'Reached Level 80, a name spoken of in legend.',
    levelRequired: 80,
    rank: 'S',
    image: legendaryImage,
  },
  {
    id: 'mythic',
    name: 'Mythic Monarch',
    description: 'Reached Level 100 — the pinnacle beyond rank.',
    levelRequired: 100,
    rank: 'S',
    image: mythicImage,
  },
];

export function isBadgeEarned(badge: BadgeDefinition, highestLevel: number): boolean {
  return highestLevel >= badge.levelRequired;
}

/** The lowest-requirement badge not yet earned, or null once every badge is earned. */
export function nextLockedBadge(highestLevel: number): BadgeDefinition | null {
  return BADGES.find((b) => !isBadgeEarned(b, highestLevel)) ?? null;
}

/** Badges whose requirement falls strictly after the previous peak and at/before the new one. */
export function newlyUnlockedBadges(previousHighestLevel: number, newHighestLevel: number): BadgeDefinition[] {
  if (newHighestLevel <= previousHighestLevel) return [];
  return BADGES.filter(
    (b) => b.levelRequired > previousHighestLevel && b.levelRequired <= newHighestLevel
  );
}
