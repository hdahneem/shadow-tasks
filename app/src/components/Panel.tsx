import type { ReactNode } from 'react';

export function Panel({
  children,
  className = '',
  violet = false,
  corners = true,
}: {
  children: ReactNode;
  className?: string;
  violet?: boolean;
  corners?: boolean;
}) {
  return (
    <div className={`hud-panel ${violet ? 'hud-panel-violet' : ''} relative ${className}`}>
      {corners && (
        <>
          <span className="hud-corner tl" />
          <span className="hud-corner tr" />
          <span className="hud-corner bl" />
          <span className="hud-corner br" />
        </>
      )}
      {children}
    </div>
  );
}
