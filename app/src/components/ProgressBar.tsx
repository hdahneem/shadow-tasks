export function ProgressBar({
  value,
  max,
  variant = 'cyan',
  label,
}: {
  value: number;
  max: number;
  variant?: 'cyan' | 'xp' | 'violet';
  label?: string;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const fillClass =
    variant === 'xp' ? 'hud-bar-fill-xp' : variant === 'violet' ? 'hud-bar-fill-violet' : '';
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between mb-1 font-body text-xs tracking-widest uppercase text-mist">
          <span>{label}</span>
          <span className="text-mist">{Math.round(pct)}%</span>
        </div>
      )}
      <div className="hud-bar-track">
        <div className={`hud-bar-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
