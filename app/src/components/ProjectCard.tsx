import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import type { Project } from '../types';
import { Panel } from './Panel';
import { RankBadge } from './RankBadge';
import { ProgressBar } from './ProgressBar';

export function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const lists = useStore((s) => s.lists);
  const tasks = useStore((s) => s.tasks);
  const projectTasks = useMemo(() => {
    const listIds = lists.filter((l) => l.projectId === project.id).map((l) => l.id);
    return tasks.filter((t) => listIds.includes(t.listId));
  }, [lists, tasks, project.id]);
  const done = projectTasks.filter((t) => t.done).length;

  return (
    <button onClick={onClick} className="text-left cursor-pointer group">
      <Panel className="p-4 h-full transition-transform group-hover:-translate-y-0.5">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-display font-bold text-sm uppercase tracking-wide text-cyan-bright truncate pr-2">
            {project.name}
          </h3>
          <RankBadge rank={project.rank} size="sm" />
        </div>
        {project.description && (
          <p className="text-xs text-mist mb-3 line-clamp-2">{project.description}</p>
        )}
        <ProgressBar value={done} max={Math.max(projectTasks.length, 1)} />
        <div className="mt-2 font-mono text-[11px] text-mist">
          {done}/{projectTasks.length} quests cleared
        </div>
      </Panel>
    </button>
  );
}
