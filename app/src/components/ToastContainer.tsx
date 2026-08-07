import { useEffect } from 'react';
import { useToastStore, type ToastItem, type ToastType } from '../store/useToastStore';

const AUTO_DISMISS_MS = 5000;

const TYPE_STYLES: Record<ToastType, string> = {
  error: 'border-danger text-danger',
  success: 'border-xp text-xp',
  info: 'border-cyan-dim text-cyan-bright',
};

function ToastRow({ id, type, message }: ToastItem) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const timer = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [id, dismiss]);

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 px-4 py-2.5 border bg-panel/95 backdrop-blur-sm shadow-lg font-body text-sm ${TYPE_STYLES[type]}`}
      style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
    >
      <span className="flex-1 min-w-0">{message}</span>
      <button
        onClick={() => dismiss(id)}
        className="shrink-0 text-mist-dim hover:text-danger cursor-pointer text-xs"
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <ToastRow key={t.id} {...t} />
      ))}
    </div>
  );
}
