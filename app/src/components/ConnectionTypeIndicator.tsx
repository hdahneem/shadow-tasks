import { useConnectionStore } from '../store/useConnectionStore';
import { isNative } from '../native';

const LABEL: Record<'wifi' | 'usb' | 'unknown', string> = {
  wifi: 'Wi-Fi',
  usb: 'USB',
  unknown: '…',
};

/**
 * Shows which backend connection the last successful request actually used —
 * only meaningful on native mobile builds where a USB fallback (see
 * api/client.ts's fetchWithFallback) exists alongside Wi-Fi, so it hides
 * itself entirely everywhere else (desktop dev, web).
 */
export function ConnectionTypeIndicator() {
  const connectionType = useConnectionStore((s) => s.connectionType);
  const candidateCount = useConnectionStore((s) => s.candidateCount);

  if (!isNative || candidateCount <= 1) return null;

  return (
    <span
      title={connectionType === 'usb' ? 'Connected via USB' : connectionType === 'wifi' ? 'Connected via Wi-Fi' : 'Connection type unknown'}
      aria-label={`Connection type: ${LABEL[connectionType]}`}
      className="flex items-center gap-1 px-2 py-1 border border-cyan-dim/20 bg-panel/60 font-body text-[10px] uppercase tracking-wider text-mist shrink-0"
    >
      <span aria-hidden="true">{connectionType === 'usb' ? '🔌' : '📶'}</span>
      <span>{LABEL[connectionType]}</span>
    </span>
  );
}
