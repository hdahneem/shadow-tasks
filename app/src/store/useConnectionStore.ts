import { create } from 'zustand';

export type ConnectionType = 'wifi' | 'usb' | 'unknown';

interface ConnectionState {
  /** Which candidate backend URL the last successful request actually went through. */
  connectionType: ConnectionType;
  /** How many distinct backend URLs the app was built with — the indicator only
   * makes sense to show when there's more than one to choose between (native
   * mobile builds with a USB fallback configured). */
  candidateCount: number;
  setConnectionType: (type: ConnectionType) => void;
  setCandidateCount: (count: number) => void;
}

// A separate store (not part of useStore) specifically so api/client.ts can
// report connection type without importing useStore.ts — useStore.ts already
// imports api/services.ts, which imports api/client.ts, so client.ts importing
// useStore.ts back would be a circular import.
export const useConnectionStore = create<ConnectionState>((set) => ({
  connectionType: 'unknown',
  candidateCount: 1,
  setConnectionType: (connectionType) => set({ connectionType }),
  setCandidateCount: (candidateCount) => set({ candidateCount }),
}));
