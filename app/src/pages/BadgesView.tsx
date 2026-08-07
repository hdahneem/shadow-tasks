import { useStore, highestLevelOf } from '../store/useStore';
import { Panel } from '../components/Panel';
import { BadgeTile } from '../components/BadgeTile';
import { BADGES, isBadgeEarned } from '../lib/badges';

export function BadgesView() {
  const hunter = useStore((s) => s.hunter);
  const highestLevel = highestLevelOf(hunter);
  const earnedCount = BADGES.filter((b) => isBadgeEarned(b, highestLevel)).length;

  return (
    <div className="max-w-3xl mx-auto animate-flicker-in">
      <div className="mb-6">
        <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan">Badges</h1>
        <p className="text-sm text-mist-dim mt-1">
          Milestone rewards earned by reaching high hunter levels. {earnedCount} / {BADGES.length} unlocked.
        </p>
      </div>

      <Panel className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {BADGES.map((badge) => (
            <BadgeTile
              key={badge.id}
              badge={badge}
              earned={isBadgeEarned(badge, highestLevel)}
              currentLevel={hunter.level}
            />
          ))}
        </div>
      </Panel>
    </div>
  );
}
