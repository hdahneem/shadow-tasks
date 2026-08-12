import { useConnectionStore } from '../store/useConnectionStore';
import { isNative } from '../native';

const CYAN_GLOW = '0 0 4px rgba(34,211,238,0.85)';

/**
 * Appears only while the app is actually talking to the backend over the USB
 * fallback (see api/client.ts's fetchWithFallback) — silent the rest of the
 * time (Wi-Fi, unknown, or non-native builds with no fallback configured at
 * all), so it doesn't compete with SyncStatusIndicator for attention on the
 * ordinary Wi-Fi happy path and only draws the eye when it's actually telling
 * you something ("your cable is doing work right now").
 */
export function ConnectionTypeIndicator() {
  const connectionType = useConnectionStore((s) => s.connectionType);
  const candidateCount = useConnectionStore((s) => s.candidateCount);

  if (!isNative || candidateCount <= 1 || connectionType !== 'usb') return null;

  return (
    <span
      title="Connected via USB"
      aria-label="Connection type: USB"
      className="flex items-center gap-1 px-2 py-1 border border-cyan-dim/20 bg-panel/60 font-body text-[10px] uppercase tracking-wider text-cyan-bright shrink-0"
    >
      <svg viewBox="0 0 32 20" className="w-4 h-3 shrink-0" style={{ filter: `drop-shadow(${CYAN_GLOW})` }} aria-hidden="true">
        <rect x="2" y="3" width="7" height="7" rx="0.6" stroke="currentColor" strokeWidth="1.3" fill="none" />
        <line x1="4" y1="3" x2="4" y2="0.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <line x1="7" y1="3" x2="7" y2="0.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
        <path d="M5.5 10 C5.5 17 24 17 24 11" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        <rect x="21" y="6" width="6" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.3" fill="none" />
      </svg>
      <span>USB</span>
    </span>
  );
}
