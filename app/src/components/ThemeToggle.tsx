import { useThemeStore, type ThemePreference } from '../store/useThemeStore';

const ORDER: ThemePreference[] = ['system', 'light', 'dark'];
const ICON: Record<ThemePreference, string> = { system: '◐', light: '☼', dark: '☾' };
const LABEL: Record<ThemePreference, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function ThemeToggle() {
  const preference = useThemeStore((s) => s.preference);
  const setPreference = useThemeStore((s) => s.setPreference);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(preference) + 1) % ORDER.length];
    setPreference(next);
  };

  return (
    <button
      onClick={cycle}
      className="shrink-0 w-7 h-7 flex items-center justify-center text-cyan-bright hover:text-cyan text-sm border border-cyan-dim/30 hover:border-cyan-dim/60 cursor-pointer transition-colors"
      style={{ clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)' }}
      title={`Theme: ${LABEL[preference]} (click to change)`}
      aria-label={`Theme: ${LABEL[preference]}. Click to switch.`}
    >
      {ICON[preference]}
    </button>
  );
}
