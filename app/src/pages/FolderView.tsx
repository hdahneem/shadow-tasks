import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { ProjectCard } from '../components/ProjectCard';
import { useModalActions } from '../context/ModalActionsContext';

export function FolderView() {
  const { folderId } = useParams<{ folderId: string }>();
  const navigate = useNavigate();
  const { openCreateProject } = useModalActions();

  const folders = useStore((s) => s.folders);
  const folder = useMemo(() => folders.find((f) => f.id === folderId), [folders, folderId]);
  const allProjects = useStore((s) => s.projects);
  const projects = useMemo(
    () => allProjects.filter((p) => p.folderId === folderId),
    [allProjects, folderId]
  );

  if (!folder) {
    return (
      <div className="max-w-5xl mx-auto animate-flicker-in">
        <p className="text-mist-dim text-sm">Folder not found.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto animate-flicker-in">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <span className="w-3 h-3 rounded-full" style={{ background: folder.color, boxShadow: `0 0 8px ${folder.color}` }} />
          <h1 className="font-display font-bold text-2xl uppercase tracking-wide text-glow-cyan">
            {folder.name}
          </h1>
        </div>
        <button onClick={() => openCreateProject(folder.id)} className="hud-btn px-4 py-2 text-sm cursor-pointer">
          + New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <p className="text-mist-dim text-sm">No projects in this folder yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} onClick={() => navigate(`/projects/${p.id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}
