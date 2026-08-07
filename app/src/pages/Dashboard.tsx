import { useNavigate } from 'react-router-dom';
import { useStore, xpForLevel, rankForLevel, highestLevelOf } from '../store/useStore';
import { Panel } from '../components/Panel';
import { ProgressBar } from '../components/ProgressBar';
import { RankBadge } from '../components/RankBadge';
import { ProjectCard } from '../components/ProjectCard';
import { BadgeTile } from '../components/BadgeTile';
import { BADGES, isBadgeEarned } from '../lib/badges';

export function Dashboard() {
  const navigate = useNavigate();
  const hunter = useStore((s) => s.hunter);
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const rank = rankForLevel(hunter.level);
  const need = xpForLevel(hunter.level);
  const highestLevel = highestLevelOf(hunter);

  const activeCount = tasks.filter((t) => !t.done).length;
  const doneToday = tasks.filter(
    (t) => t.done && t.completedAt && new Date(t.completedAt).toDateString() === new Date().toDateString()
  ).length;

  return (
    <div className="max-w-5xl mx-auto animate-flicker-in">
      <Panel className="p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display font-black text-xl tracking-[0.3em] text-glow-cyan uppercase">
            Status
          </h1>
          <RankBadge rank={rank} size="lg" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-display font-black text-6xl text-glow-cyan leading-none">
                {hunter.level}
              </span>
              <span className="font-body text-sm tracking-widest text-mist uppercase">Level</span>
            </div>
            <ProgressBar value={hunter.xp} max={need} variant="xp" label="Experience" />
            <div className="flex justify-between mt-1 font-mono text-[11px] text-mist">
              <span>{hunter.xp} XP</span>
              <span>{need} XP to next level</span>
            </div>
          </div>

          <div className="flex flex-col gap-3 justify-center font-body text-sm">
            <StatRow label="Title" value="Todo Hunter" />
            <StatRow label="Active Quests" value={String(activeCount)} />
            <StatRow label="Cleared Today" value={String(doneToday)} />
            <StatRow label="Total Cleared" value={String(hunter.tasksCompleted)} />
          </div>

          <div className="flex flex-col gap-3 justify-center">
            <div className="font-display text-[11px] tracking-[0.2em] text-mist-dim uppercase mb-1">
              Active Projects
            </div>
            <div className="font-display font-bold text-4xl text-glow-violet">{projects.length}</div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-cyan-dim/15 flex items-center flex-wrap justify-between gap-4">
          <div className="flex flex-wrap gap-6">
            {BADGES.map((badge) => (
              <BadgeTile
                key={badge.id}
                badge={badge}
                earned={isBadgeEarned(badge, highestLevel)}
                currentLevel={hunter.level}
                size="sm"
              />
            ))}
          </div>
          <button
            onClick={() => navigate('/badges')}
            className="hud-btn text-xs px-3 py-1.5 cursor-pointer shrink-0"
          >
            View Badges
          </button>
        </div>
      </Panel>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display font-bold text-sm tracking-[0.2em] text-mist uppercase">
          Quest Log
        </h2>
      </div>

      {projects.length === 0 ? (
        <Panel className="p-8 text-center">
          <p className="text-mist-dim text-sm">
            No projects yet. Create one from the sidebar to start your ascent.
          </p>
        </Panel>
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

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-cyan-dim/15 pb-2">
      <span className="text-mist uppercase tracking-wider text-xs">{label}</span>
      <span className="text-cyan-bright font-semibold">{value}</span>
    </div>
  );
}
