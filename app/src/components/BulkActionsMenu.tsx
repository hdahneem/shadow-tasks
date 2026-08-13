import { useEffect, useRef, useState } from 'react';

export interface BulkActionMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  title?: string;
}

/**
 * Discoverable "Actions ▾" dropdown for the less-common bulk actions, so the
 * toolbar doesn't grow a button per action forever. Reuses the click-outside
 * pattern from NotificationBell.
 */
export function BulkActionsMenu({ items, busy = false }: { items: BulkActionMenuItem[]; busy?: boolean }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="hud-btn px-2 py-1 cursor-pointer disabled:opacity-50"
      >
        Actions ▾
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-56 z-50 bg-void border border-cyan-dim/30 shadow-lg py-1">
          {items.map((item) => (
            <button
              key={item.key}
              disabled={item.disabled || busy}
              title={item.title}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="w-full text-left px-3 py-1.5 text-xs cursor-pointer text-mist hover:bg-cyan-dim/10 hover:text-cyan-bright disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent disabled:hover:text-mist"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
