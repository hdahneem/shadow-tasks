import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createTask(
  accessToken: string,
  listId: string,
  overrides: Partial<{ title: string; dueDate: string; estimatedMinutes: number }> = {}
) {
  const { estimatedMinutes, ...createBody } = overrides;
  const res = await request(app)
    .post(`/api/v1/tasks/by-list/${listId}`)
    .set(auth(accessToken))
    .send({ title: 'Quest', ...createBody });
  if (estimatedMinutes !== undefined) {
    await request(app).patch(`/api/v1/tasks/${res.body.id}`).set(auth(accessToken)).send({ estimatedMinutes });
  }
  return res.body;
}

describe('workspace workload', () => {
  it('aggregates open/done/overdue task counts and estimated minutes per assignee', async () => {
    const owner = await registerAndLogin('workload-owner@example.com');
    const helper = await registerAndLogin('workload-helper@example.com');
    const { workspace, list } = await createFolderProjectListChain(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'workload-helper@example.com', role: 'member' });

    const overdueTask = await createTask(owner.accessToken, list.id, {
      dueDate: new Date(Date.now() - 86400000).toISOString(),
      estimatedMinutes: 60,
    });
    const futureTask = await createTask(owner.accessToken, list.id, {
      dueDate: new Date(Date.now() + 86400000).toISOString(),
      estimatedMinutes: 30,
    });
    const doneTask = await createTask(owner.accessToken, list.id, { estimatedMinutes: 15 });

    await request(app)
      .post(`/api/v1/tasks/${overdueTask.id}/assignees`)
      .set(auth(owner.accessToken))
      .send({ userId: owner.user.id });
    await request(app)
      .post(`/api/v1/tasks/${futureTask.id}/assignees`)
      .set(auth(owner.accessToken))
      .send({ userId: helper.user.id });
    await request(app)
      .post(`/api/v1/tasks/${doneTask.id}/assignees`)
      .set(auth(owner.accessToken))
      .send({ userId: owner.user.id });
    await request(app).patch(`/api/v1/tasks/${doneTask.id}`).set(auth(owner.accessToken)).send({ done: true });

    const res = await request(app).get(`/api/v1/workspaces/${workspace.id}/workload`).set(auth(owner.accessToken));
    expect(res.status).toBe(200);

    const ownerRow = res.body.find((r: { userId: string }) => r.userId === owner.user.id);
    const helperRow = res.body.find((r: { userId: string }) => r.userId === helper.user.id);

    expect(ownerRow.totalTasks).toBe(2);
    expect(ownerRow.openTasks).toBe(1);
    expect(ownerRow.doneTasks).toBe(1);
    expect(ownerRow.overdueTasks).toBe(1);
    expect(ownerRow.estimatedMinutes).toBe(75);

    expect(helperRow.totalTasks).toBe(1);
    expect(helperRow.openTasks).toBe(1);
    expect(helperRow.overdueTasks).toBe(0);
    expect(helperRow.estimatedMinutes).toBe(30);
  });

  it('includes members with zero assigned tasks', async () => {
    const owner = await registerAndLogin('workload-owner2@example.com');
    const idle = await registerAndLogin('workload-idle@example.com');
    const { workspace } = await createFolderProjectListChain(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'workload-idle@example.com', role: 'member' });

    const res = await request(app).get(`/api/v1/workspaces/${workspace.id}/workload`).set(auth(owner.accessToken));
    const idleRow = res.body.find((r: { userId: string }) => r.userId === idle.user.id);
    expect(idleRow).toMatchObject({ totalTasks: 0, openTasks: 0, doneTasks: 0, overdueTasks: 0, estimatedMinutes: 0 });
  });

  it('excludes archived tasks from workload counts', async () => {
    const owner = await registerAndLogin('workload-owner3@example.com');
    const { workspace, list } = await createFolderProjectListChain(owner.accessToken);

    const task = await createTask(owner.accessToken, list.id, { estimatedMinutes: 45 });
    await request(app)
      .post(`/api/v1/tasks/${task.id}/assignees`)
      .set(auth(owner.accessToken))
      .send({ userId: owner.user.id });
    await request(app).post(`/api/v1/tasks/${task.id}/archive`).set(auth(owner.accessToken)).send();

    const res = await request(app).get(`/api/v1/workspaces/${workspace.id}/workload`).set(auth(owner.accessToken));
    const ownerRow = res.body.find((r: { userId: string }) => r.userId === owner.user.id);
    expect(ownerRow.totalTasks).toBe(0);
  });

  it('rejects non-members', async () => {
    const owner = await registerAndLogin('workload-owner4@example.com');
    const outsider = await registerAndLogin('workload-outsider@example.com');
    const { workspace } = await createFolderProjectListChain(owner.accessToken);

    const res = await request(app).get(`/api/v1/workspaces/${workspace.id}/workload`).set(auth(outsider.accessToken));
    expect(res.status).toBe(404);
  });
});
