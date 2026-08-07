import { useStore, xpForLevel } from '../store/useStore';
import { rankForLevel } from '../store/useStore';
import { ProgressBar } from './ProgressBar';
import { RankBadge } from './RankBadge';

export function HunterWidget() {
  const hunter = useStore((s) => s.hunter);
  const rank = rankForLevel(hunter.level);
  const need = xpForLevel(hunter.level);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-1">
        <span className="font-display text-[11px] tracking-[0.25em] text-mist uppercase">Hunter</span>
        <RankBadge rank={rank} size="sm" />
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-display font-black text-4xl text-glow-cyan leading-none">
          {hunter.level}
        </span>
        <span className="font-body text-xs tracking-widest text-mist uppercase">Level</span>
      </div>
      <ProgressBar value={hunter.xp} max={need} variant="xp" />
      <div className="flex justify-between mt-1 font-mono text-[10px] text-mist">
        <span>{hunter.xp} XP</span>
        <span>{need} XP</span>
      </div>
      <div className="mt-3 pt-3 border-t border-cyan-dim/20 font-body text-xs text-mist flex justify-between">
        <span className="uppercase tracking-wider">Quests Cleared</span>
        <span className="text-cyan-bright font-semibold">{hunter.tasksCompleted}</span>
      </div>
    </div>
  );
}
