import type { BadgeDefinition } from '../lib/badges';

export function BadgeTile({
  badge,
  earned,
  currentLevel,
  size = 'md',
}: {
  badge: BadgeDefinition;
  earned: boolean;
  currentLevel: number;
  size?: 'sm' | 'md';
}) {
  const dimension = size === 'sm' ? 'w-14 h-14' : 'w-24 h-24';
  return (
    <div className="flex flex-col items-center gap-2 text-center" title={badge.description}>
      <div
        className={`${dimension} rounded-full overflow-hidden border-2 ${
          earned ? 'border-cyan-bright shadow-[0_0_16px_rgba(34,211,238,0.5)]' : 'border-cyan-dim/20'
        }`}
      >
        <img
          src={badge.image}
          alt={badge.name}
          className={`w-full h-full object-cover ${earned ? '' : 'grayscale opacity-30'}`}
        />
      </div>
      {size === 'md' && (
        <div>
          <p className={`font-display text-xs uppercase tracking-wide ${earned ? 'text-cyan-bright' : 'text-mist-dim'}`}>
            {badge.name}
          </p>
          <p className="font-mono text-[10px] text-mist-dim mt-0.5">
            {earned ? `Unlocked at Level ${badge.levelRequired}` : `Locked — reach Level ${badge.levelRequired}`}
          </p>
          {!earned && (
            <p className="font-mono text-[10px] text-mist-dim">
              Currently Level {currentLevel}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
