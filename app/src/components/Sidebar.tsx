import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';
import { useModalActions } from '../context/ModalActionsContext';
import { HunterWidget } from './HunterWidget';
import { Panel } from './Panel';
import { ThemeToggle } from './ThemeToggle';
import { NotificationBell } from './NotificationBell';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export function Sidebar({
  onCreateFolder,
  onCreateProject,
  onCreateProjectFromTemplate,
  open,
  onClose,
}: {
  onCreateFolder: () => void;
  onCreateProject: (folderId: string | null) => void;
  onCreateProjectFromTemplate: (folderId: string | null) => void;
  open: boolean;
  onClose: () => void;
}) {
  const currentWorkspaceId = useStore((s) => s.currentWorkspaceId);
  const currentRole = useStore((s) => s.workspaces.find((w) => w.id === s.currentWorkspaceId)?.role);
  const isAdmin = currentRole === 'admin' || currentRole === 'owner';
  const allFolders = useStore((s) => s.folders);
  const allProjects = useStore((s) => s.projects);
  const folders = allFolders.filter((f) => f.workspaceId === currentWorkspaceId);
  const projects = allProjects.filter((p) => p.workspaceId === currentWorkspaceId);
  const deleteFolder = useStore((s) => s.deleteFolder);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { openSettings, openImportCsv } = useModalActions();
  const location = useLocation();
  const navigateTo = useNavigate();

  const unfoldered = projects.filter((p) => p.folderId === null);

  const go = (path: string) => {
    navigateTo(path);
    onClose();
  };

  const isActive = (path: string) => location.pathname === path;

  const navBtn = (active: boolean) =>
    `w-full text-left px-3 py-1.5 font-body text-sm tracking-wide flex items-center gap-1.5 transition-colors cursor-pointer ${
      active
        ? 'text-cyan-bright bg-cyan-dim/15 border-l-2 border-cyan'
        : 'text-mist hover:text-cyan-bright hover:bg-cyan-dim/5 border-l-2 border-transparent'
    }`;

  // Icon glyph and label are separate spans (not one truncated text node) —
  // mixing a fallback-font icon character with body text in a single
  // text-overflow:ellipsis run corrupts glyph rendering on some WebViews.
  const NavLabel = ({ icon, children }: { icon: string; children: string }) => (
    <>
      <span className="shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </>
  );

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/60 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-72 shrink-0 flex flex-col gap-4 p-4 overflow-y-auto bg-void transition-transform duration-300 ease-out md:static md:z-auto md:h-screen md:sticky md:top-0 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 bg-cyan rounded-full shadow-[0_0_8px_2px_rgba(34,211,238,0.8)] shrink-0" />
            <h1 className="font-display font-bold tracking-[0.2em] text-sm text-glow-cyan uppercase truncate">
              Shadow Tasks
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <NotificationBell />
            <ThemeToggle />
          </div>
        </div>

        <WorkspaceSwitcher />

        <Panel>
          <HunterWidget />
        </Panel>

        <Panel className="flex-1 min-h-0 flex flex-col">
          <div className="p-3 flex flex-col gap-1 min-h-0 overflow-y-auto">
            <button className={navBtn(isActive('/'))} onClick={() => go('/')}>
              <NavLabel icon="⌂">Status Window</NavLabel>
            </button>
            <button className={navBtn(isActive('/all'))} onClick={() => go('/all')}>
              <NavLabel icon="◆">All Quests</NavLabel>
            </button>
            <button className={navBtn(isActive('/calendar'))} onClick={() => go('/calendar')}>
              <NavLabel icon="▤">Calendar</NavLabel>
            </button>
            <button className={navBtn(isActive('/search'))} onClick={() => go('/search')}>
              <NavLabel icon="⌕">Search</NavLabel>
            </button>
            <button className={navBtn(isActive('/archived'))} onClick={() => go('/archived')}>
              <NavLabel icon="⧉">Archived</NavLabel>
            </button>
            <button className={navBtn(location.pathname.startsWith('/docs'))} onClick={() => go('/docs')}>
              <NavLabel icon="▥">Docs</NavLabel>
            </button>
            <button className={navBtn(isActive('/activity'))} onClick={() => go('/activity')}>
              <NavLabel icon="≡">Activity</NavLabel>
            </button>
            <button className={navBtn(isActive('/workload'))} onClick={() => go('/workload')}>
              <NavLabel icon="⚖">Workload</NavLabel>
            </button>
            <button className={navBtn(isActive('/badges'))} onClick={() => go('/badges')}>
              <NavLabel icon="🎖">Badges</NavLabel>
            </button>

            <div className="mt-3 mb-1 flex items-center justify-between px-1">
              <span className="font-display text-[10px] tracking-[0.2em] text-mist-dim uppercase">
                Folders
              </span>
              {isAdmin && (
                <button
                  onClick={onCreateFolder}
                  className="text-cyan-dim hover:text-cyan-bright text-sm leading-none cursor-pointer"
                  title="New folder"
                >
                  +
                </button>
              )}
            </div>

            {folders.map((f) => {
              const isOpen = expanded[f.id] ?? true;
              const folderProjects = projects.filter((p) => p.folderId === f.id);
              return (
                <div key={f.id}>
                  <div className="flex items-center group">
                    <button
                      className={navBtn(isActive(`/folders/${f.id}`)) + ' flex-1'}
                      onClick={() => go(`/folders/${f.id}`)}
                    >
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpanded((s) => ({ ...s, [f.id]: !isOpen }));
                        }}
                        className="text-mist-dim select-none"
                      >
                        {isOpen ? '▾' : '▸'}
                      </span>
                      <span style={{ color: f.color }}>■</span>
                      <span className="truncate">{f.name}</span>
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => onCreateProject(f.id)}
                          className="opacity-0 group-hover:opacity-100 text-cyan-dim hover:text-cyan-bright px-1.5 text-sm cursor-pointer"
                          title="New project in folder"
                        >
                          +
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete folder "${f.name}" and everything inside it?`)) deleteFolder(f.id).catch(() => {});
                          }}
                          className="opacity-0 group-hover:opacity-100 text-mist-dim hover:text-danger px-1.5 text-xs cursor-pointer"
                          title="Delete folder"
                        >
                          ✕
                        </button>
                      </>
                    )}
                  </div>
                  {isOpen && (
                    <div className="ml-5 flex flex-col gap-0.5">
                      {folderProjects.map((p) => (
                        <button
                          key={p.id}
                          className={navBtn(isActive(`/projects/${p.id}`)) + ' text-xs'}
                          onClick={() => go(`/projects/${p.id}`)}
                        >
                          <span className="truncate">{p.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="mt-3 mb-1 flex items-center justify-between px-1">
              <span className="font-display text-[10px] tracking-[0.2em] text-mist-dim uppercase">
                Projects
              </span>
              {isAdmin && (
                <span className="flex items-center gap-2">
                  <button
                    onClick={openImportCsv}
                    className="text-cyan-dim hover:text-cyan-bright text-xs leading-none cursor-pointer"
                    title="Import from CSV"
                  >
                    ⇪
                  </button>
                  <button
                    onClick={() => onCreateProjectFromTemplate(null)}
                    className="text-cyan-dim hover:text-cyan-bright text-xs leading-none cursor-pointer"
                    title="New project from template"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={() => onCreateProject(null)}
                    className="text-cyan-dim hover:text-cyan-bright text-sm leading-none cursor-pointer"
                    title="New project"
                  >
                    +
                  </button>
                </span>
              )}
            </div>
            {unfoldered.map((p) => (
              <button
                key={p.id}
                className={navBtn(isActive(`/projects/${p.id}`))}
                onClick={() => go(`/projects/${p.id}`)}
              >
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        </Panel>

        <div className="flex items-center justify-between px-1 pt-1 border-t border-cyan-dim/15">
          <button
            onClick={openSettings}
            className="text-xs text-mist hover:text-cyan-bright cursor-pointer truncate min-w-0"
          >
            {user?.name}
          </button>
          <button
            onClick={() => logout()}
            className="text-xs text-mist-dim hover:text-danger cursor-pointer shrink-0"
          >
            Sign out
          </button>
        </div>
        <p className="hidden md:block text-center text-[10px] text-mist-dim tracking-wide">
          Press <kbd className="font-mono text-cyan-dim">⌘K</kbd> for commands · <kbd className="font-mono text-cyan-dim">?</kbd> for shortcuts
        </p>
      </aside>
    </>
  );
}
