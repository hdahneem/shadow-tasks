import { RANK_COLORS, type Rank } from '../types';

export function RankBadge({ rank, size = 'md' }: { rank: Rank; size?: 'sm' | 'md' | 'lg' }) {
  const color = RANK_COLORS[rank];
  const sizeClass = size === 'sm' ? 'text-[10px] px-1.5' : size === 'lg' ? 'text-lg px-4 py-1' : 'text-xs';
  return (
    <span className={`rank-badge inline-block ${sizeClass}`} style={{ color }}>
      {rank}-RANK
    </span>
  );
}
