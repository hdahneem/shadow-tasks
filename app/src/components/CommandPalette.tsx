import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { useThemeStore, type ThemePreference } from '../store/useThemeStore';
import { useModalActions } from '../context/ModalActionsContext';
import { filterCommands, type Command } from '../lib/shortcuts';

const THEME_ORDER: ThemePreference[] = ['system', 'light', 'dark'];

export function CommandPalette({
  open,
  onClose,
  onShowHelp,
}: {
  open: boolean;
  onClose: () => void;
  onShowHelp: () => void;
}) {
  const navigate = useNavigate();
  const folders = useStore((s) => s.folders);
  const projects = useStore((s) => s.projects);
  const logout = useAuthStore((s) => s.logout);
  const themePreference = useThemeStore((s) => s.preference);
  const setThemePreference = useThemeStore((s) => s.setPreference);
  const { openCreateFolder, openCreateProject, openSettings } = useModalActions();

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      onClose();
      navigate(path);
    };
    return [
      { id: 'go-home', label: 'Go to Status Window', group: 'Pages', keywords: 'home dashboard', run: go('/') },
      { id: 'go-today', label: "Go to Today's Tasks", group: 'Pages', keywords: 'daily plan suggestions', run: go('/today') },
      { id: 'go-all', label: 'Go to All Quests', group: 'Pages', keywords: 'tasks list', run: go('/all') },
      { id: 'go-calendar', label: 'Go to Calendar', group: 'Pages', keywords: 'schedule', run: go('/calendar') },
      { id: 'go-search', label: 'Go to Search', group: 'Pages', keywords: 'find', run: go('/search') },
      { id: 'go-archived', label: 'Go to Archived Quests', group: 'Pages', keywords: 'archive restore trash', run: go('/archived') },
      { id: 'go-docs', label: 'Go to Docs', group: 'Pages', keywords: 'wiki notes documents', run: go('/docs') },
      { id: 'go-activity', label: 'Go to Activity', group: 'Pages', keywords: 'feed history log recent', run: go('/activity') },
      { id: 'go-workload', label: 'Go to Workload', group: 'Pages', keywords: 'capacity balance assignees', run: go('/workload') },
      { id: 'go-badges', label: 'Go to Badges', group: 'Pages', keywords: 'achievements rewards levels', run: go('/badges') },
      ...projects.map((p) => ({
        id: `project-${p.id}`,
        label: p.name,
        group: 'Projects',
        keywords: 'project quest board',
        run: go(`/projects/${p.id}`),
      })),
      ...folders.map((f) => ({
        id: `folder-${f.id}`,
        label: f.name,
        group: 'Folders',
        keywords: 'folder',
        run: go(`/folders/${f.id}`),
      })),
      {
        id: 'new-folder',
        label: 'New Folder',
        group: 'Actions',
        run: () => {
          onClose();
          openCreateFolder();
        },
      },
      {
        id: 'new-project',
        label: 'New Project',
        group: 'Actions',
        run: () => {
          onClose();
          openCreateProject(null);
        },
      },
      {
        id: 'toggle-theme',
        label: `Switch Theme (currently ${themePreference})`,
        group: 'Actions',
        keywords: 'dark light appearance',
        run: () => {
          const next = THEME_ORDER[(THEME_ORDER.indexOf(themePreference) + 1) % THEME_ORDER.length];
          setThemePreference(next);
          onClose();
        },
      },
      {
        id: 'shortcuts-help',
        label: 'Keyboard Shortcuts',
        group: 'Actions',
        keywords: 'help cheat sheet',
        run: () => {
          onClose();
          onShowHelp();
        },
      },
      {
        id: 'settings',
        label: 'Hunter Settings',
        group: 'Actions',
        keywords: 'account profile password name',
        run: () => {
          onClose();
          openSettings();
        },
      },
      {
        id: 'sign-out',
        label: 'Sign Out',
        group: 'Actions',
        keywords: 'logout',
        run: () => {
          onClose();
          logout();
        },
      },
    ];
  }, [
    navigate,
    onClose,
    projects,
    folders,
    openCreateFolder,
    openCreateProject,
    openSettings,
    themePreference,
    setThemePreference,
    onShowHelp,
    logout,
  ]);

  const filtered = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (filtered.length ? (i - 1 + filtered.length) % filtered.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      filtered[activeIndex]?.run();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  let renderedGroup = '';

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 pt-[12vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg animate-flicker-in hud-panel relative"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="hud-corner tl" />
        <span className="hud-corner tr" />
        <span className="hud-corner bl" />
        <span className="hud-corner br" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command or search…"
          className="w-full bg-transparent px-4 py-3.5 text-sm font-body text-mist placeholder:text-mist-dim outline-none border-b border-cyan-dim/15"
        />
        <div className="max-h-[50vh] overflow-y-auto py-2">
          {filtered.length === 0 && <p className="px-4 py-3 text-sm text-mist-dim">No matching commands.</p>}
          {filtered.map((cmd, i) => {
            const showHeader = cmd.group !== renderedGroup;
            renderedGroup = cmd.group;
            return (
              <div key={cmd.id}>
                {showHeader && (
                  <div className="px-4 pt-2 pb-1 font-display text-[10px] tracking-[0.2em] text-mist-dim uppercase">
                    {cmd.group}
                  </div>
                )}
                <button
                  onClick={() => cmd.run()}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`w-full text-left px-4 py-2 text-sm cursor-pointer transition-colors ${
                    i === activeIndex ? 'bg-cyan-dim/15 text-cyan-bright' : 'text-mist hover:bg-cyan-dim/5'
                  }`}
                >
                  {cmd.label}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
