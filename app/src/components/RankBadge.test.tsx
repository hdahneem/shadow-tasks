import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RankBadge } from './RankBadge';
import { RANK_COLORS } from '../types';

describe('RankBadge', () => {
  it('renders the rank label and its associated color for every rank', () => {
    (Object.keys(RANK_COLORS) as Array<keyof typeof RANK_COLORS>).forEach((rank) => {
      const { unmount } = render(<RankBadge rank={rank} />);
      const badge = screen.getByText(`${rank}-RANK`);
      expect(badge).toBeInTheDocument();
      expect(badge.style.color).toBe(hexToRgb(RANK_COLORS[rank]));
      unmount();
    });
  });
});

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}
