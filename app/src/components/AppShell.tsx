import { useEffect, useRef, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { useStore } from '../store/useStore';
import { Sidebar } from './Sidebar';
import { CreateFolderModal } from './CreateFolderModal';
import { CreateProjectModal } from './CreateProjectModal';
import { CreateProjectFromTemplateModal } from './CreateProjectFromTemplateModal';
import { ImportCsvModal } from './ImportCsvModal';
import { CommandPalette } from './CommandPalette';
import { ShortcutsHelp } from './ShortcutsHelp';
import { SettingsModal } from './SettingsModal';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { ConnectionTypeIndicator } from './ConnectionTypeIndicator';
import { PullToRefresh } from './PullToRefresh';
import { ModalActionsContext } from '../context/ModalActionsContext';
import { GO_SHORTCUTS, isTypingTarget } from '../lib/shortcuts';

export function AppShell() {
  const status = useAuthStore((s) => s.status);
  const location = useLocation();
  const navigate = useNavigate();

  const loaded = useStore((s) => s.loaded);
  const loadAll = useStore((s) => s.loadAll);
  // A non-empty local cache (see useStore's partialize) means there's something to
  // show immediately even if loadAll() can't reach the network right now — offline
  // cold starts should render the last-known data, not block on a full-screen error.
  const hasPersistedData = useStore((s) => s.tasks.length > 0 || s.folders.length > 0 || s.projects.length > 0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [navOpen, setNavOpen] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [creatingProjectIn, setCreatingProjectIn] = useState<string | null>(null);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [showProjectFromTemplateModal, setShowProjectFromTemplateModal] = useState(false);
  const [showImportCsvModal, setShowImportCsvModal] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const gPendingRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && !loaded) {
      loadAll().catch(() => {
        // With cached data already on screen, a failed background refresh isn't
        // fatal — SyncManager's offline indicator communicates the connectivity
        // problem instead of blocking the whole UI on it.
        if (!hasPersistedData) setLoadError('Could not load your data. Check your connection and retry.');
      });
    }
  }, [status, loaded, loadAll, hasPersistedData]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setHelpOpen(false);
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape') {
        if (paletteOpen) setPaletteOpen(false);
        else if (helpOpen) setHelpOpen(false);
        return;
      }
      if (paletteOpen || helpOpen || isTypingTarget(e.target)) return;

      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }

      if (gPendingRef.current) {
        gPendingRef.current = false;
        if (gTimerRef.current) clearTimeout(gTimerRef.current);
        const dest = GO_SHORTCUTS[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          navigate(dest);
        }
        return;
      }

      if (e.key.toLowerCase() === 'g') {
        gPendingRef.current = true;
        gTimerRef.current = setTimeout(() => {
          gPendingRef.current = false;
        }, 800);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (gTimerRef.current) clearTimeout(gTimerRef.current);
    };
  }, [paletteOpen, helpOpen, navigate]);

  if (status === 'idle' || status === 'loading') {
    return (
      <div className="hud-grid min-h-screen flex items-center justify-center">
        <p className="font-display text-sm tracking-widest text-mist uppercase animate-pulse">
          Connecting to the System…
        </p>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (loadError) {
    return (
      <div className="hud-grid min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <p className="text-danger text-sm mb-4">{loadError}</p>
          <button
            onClick={() => {
              setLoadError(null);
              loadAll().catch(() => {
                if (!hasPersistedData) setLoadError('Could not load your data. Check your connection and retry.');
              });
            }}
            className="hud-btn px-4 py-2 text-sm cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!loaded && !hasPersistedData) {
    return (
      <div className="hud-grid min-h-screen flex items-center justify-center">
        <p className="font-display text-sm tracking-widest text-mist uppercase animate-pulse">
          Loading your quest log…
        </p>
      </div>
    );
  }

  const openCreateProject = (folderId: string | null) => {
    setCreatingProjectIn(folderId);
    setShowProjectModal(true);
  };

  const openCreateProjectFromTemplate = (folderId: string | null) => {
    setCreatingProjectIn(folderId);
    setShowProjectFromTemplateModal(true);
  };

  return (
    <ModalActionsContext.Provider
      value={{
        openCreateFolder: () => setCreatingFolder(true),
        openCreateProject,
        openSettings: () => setSettingsOpen(true),
        openImportCsv: () => setShowImportCsvModal(true),
      }}
    >
      <div className="hud-grid min-h-screen flex relative z-10">
        <Sidebar
          onCreateFolder={() => setCreatingFolder(true)}
          onCreateProject={openCreateProject}
          onCreateProjectFromTemplate={openCreateProjectFromTemplate}
          open={navOpen}
          onClose={() => setNavOpen(false)}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 bg-void/95 border-b border-cyan-dim/20 backdrop-blur">
            <button
              onClick={() => setNavOpen(true)}
              className="text-cyan-bright text-xl leading-none px-1 cursor-pointer"
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="w-1.5 h-1.5 bg-cyan rounded-full shadow-[0_0_8px_2px_rgba(34,211,238,0.8)]" />
            <h1 className="font-display font-bold tracking-[0.2em] text-xs text-glow-cyan uppercase">
              Shadow Tasks
            </h1>
            <div className="ml-auto flex items-center gap-1.5">
              <ConnectionTypeIndicator />
              <SyncStatusIndicator />
            </div>
          </header>

          <PullToRefresh>
            <div className="p-4 md:p-8">
              <Outlet />
            </div>
          </PullToRefresh>
        </div>

        {creatingFolder && <CreateFolderModal onClose={() => setCreatingFolder(false)} />}
        {showProjectModal && (
          <CreateProjectModal
            folderId={creatingProjectIn}
            onClose={() => setShowProjectModal(false)}
            onCreated={(id) => {
              setShowProjectModal(false);
              navigate(`/projects/${id}`);
            }}
          />
        )}
        {showProjectFromTemplateModal && (
          <CreateProjectFromTemplateModal
            folderId={creatingProjectIn}
            onClose={() => setShowProjectFromTemplateModal(false)}
            onCreated={(id) => {
              setShowProjectFromTemplateModal(false);
              navigate(`/projects/${id}`);
            }}
          />
        )}
        {showImportCsvModal && <ImportCsvModal onClose={() => setShowImportCsvModal(false)} />}
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          onShowHelp={() => setHelpOpen(true)}
        />
        {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </div>
    </ModalActionsContext.Provider>
  );
}
