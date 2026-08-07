/**
 * One-off backfill for the statuses migration: every project that predates the
 * Status model gets three default statuses (To Do / In Progress / Done), and
 * every existing task gets a statusId consistent with its current `done` flag
 * (done -> Done, not done -> To Do). Safe to re-run: projects that already
 * have statuses are skipped entirely.
 */
import { prisma } from '../src/lib/prisma.js';

async function main() {
  const projects = await prisma.project.findMany({ include: { statuses: true } });
  let projectsBackfilled = 0;
  let tasksBackfilled = 0;

  for (const project of projects) {
    if (project.statuses.length > 0) continue;

    const [todo, inProgress, done] = await prisma.$transaction([
      prisma.status.create({
        data: { projectId: project.id, name: 'To Do', color: '#7c93b3', position: 1, isCompleted: false },
      }),
      prisma.status.create({
        data: { projectId: project.id, name: 'In Progress', color: '#22d3ee', position: 2, isCompleted: false },
      }),
      prisma.status.create({
        data: { projectId: project.id, name: 'Done', color: '#4ade80', position: 3, isCompleted: true },
      }),
    ]);

    const notDone = await prisma.task.updateMany({
      where: { list: { projectId: project.id }, done: false, statusId: null },
      data: { statusId: todo.id },
    });
    const isDone = await prisma.task.updateMany({
      where: { list: { projectId: project.id }, done: true, statusId: null },
      data: { statusId: done.id },
    });

    void inProgress;
    projectsBackfilled += 1;
    tasksBackfilled += notDone.count + isDone.count;
  }

  console.log(`Backfilled ${projectsBackfilled} project(s), ${tasksBackfilled} task(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
