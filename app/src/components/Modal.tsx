import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Panel } from './Panel';

export function Modal({
  title,
  onClose,
  children,
  violet = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  violet?: boolean;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4 py-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-flicker-in"
        onClick={(e) => e.stopPropagation()}
      >
        <Panel violet={violet} className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h2
              className={`font-display font-bold tracking-widest uppercase text-lg ${violet ? 'text-glow-violet' : 'text-glow-cyan'}`}
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-mist hover:text-cyan-bright font-display text-xl leading-none px-2 cursor-pointer"
              aria-label="Close"
            >
              ×
            </button>
          </div>
          {children}
        </Panel>
      </div>
    </div>,
    document.body
  );
}
