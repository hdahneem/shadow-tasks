import type { Rank } from '../types';
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

export const BADGES: BadgeDefinition[] = [
  {
    id: 'epic',
    name: 'Epic Ascendant',
    description: 'Reached Level 20, breaking into C-Rank.',
    levelRequired: 20,
    rank: 'C',
    image: epicImage,
  },
  {
    id: 'legendary',
    name: 'Legendary Hunter',
    description: 'Reached Level 40, breaking into A-Rank.',
    levelRequired: 40,
    rank: 'A',
    image: legendaryImage,
  },
  {
    id: 'mythic',
    name: 'Mythic Monarch',
    description: 'Reached Level 50 — S-Rank, the peak of power.',
    levelRequired: 50,
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
