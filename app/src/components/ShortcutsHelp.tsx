import { Modal } from './Modal';

const SHORTCUTS: { keys: string; description: string }[] = [
  { keys: '⌘K / Ctrl+K', description: 'Open the command palette' },
  { keys: 'G then H', description: 'Go to Status Window' },
  { keys: 'G then T', description: "Go to Today's Tasks" },
  { keys: 'G then A', description: 'Go to All Quests' },
  { keys: 'G then C', description: 'Go to Calendar' },
  { keys: 'G then S', description: 'Go to Search' },
  { keys: 'G then R', description: 'Go to Archived Quests' },
  { keys: 'G then D', description: 'Go to Docs' },
  { keys: 'G then V', description: 'Go to Activity' },
  { keys: 'G then W', description: 'Go to Workload' },
  { keys: 'G then B', description: 'Go to Badges' },
  { keys: '?', description: 'Show this shortcuts list' },
  { keys: 'Esc', description: 'Close the open dialog' },
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard Shortcuts" onClose={onClose}>
      <div className="flex flex-col gap-2.5">
        {SHORTCUTS.map((s) => (
          <div key={s.keys} className="flex items-center justify-between gap-4">
            <span className="text-sm text-mist">{s.description}</span>
            <kbd className="font-mono text-[11px] text-cyan-bright bg-cyan-dim/10 border border-cyan-dim/25 px-2 py-1">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </Modal>
  );
}
