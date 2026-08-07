import { createContext, useContext } from 'react';

export interface ModalActions {
  openCreateFolder: () => void;
  openCreateProject: (folderId: string | null) => void;
  openSettings: () => void;
}

export const ModalActionsContext = createContext<ModalActions | null>(null);

export function useModalActions(): ModalActions {
  const ctx = useContext(ModalActionsContext);
  if (!ctx) throw new Error('useModalActions must be used within AppShell');
  return ctx;
}
