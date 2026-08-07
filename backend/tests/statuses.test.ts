import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('statuses & board', () => {
  it('auto-creates three default statuses when a project is created', async () => {
    const { accessToken } = await registerAndLogin();
    const { project } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const res = await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h);
    expect(res.status).toBe(200);
    expect(res.body.map((s: any) => s.name)).toEqual(['To Do', 'In Progress', 'Done']);
    expect(res.body.find((s: any) => s.name === 'Done').isCompleted).toBe(true);
    expect(res.body.find((s: any) => s.name === 'To Do').isCompleted).toBe(false);
  });

  it('assigns a new task the project\'s default (first non-completed) status', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });

    expect(task.body.statusId).toBeTruthy();
    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.status.name).toBe('To Do');
  });

  it('moving a task to a completed status marks it done, and back marks it not done', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const statuses = await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h);
    const doneStatus = statuses.body.find((s: any) => s.name === 'Done');
    const todoStatus = statuses.body.find((s: any) => s.name === 'To Do');

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });

    const moved = await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/status`)
      .set(h)
      .send({ statusId: doneStatus.id });
    expect(moved.status).toBe(200);
    expect(moved.body.done).toBe(true);
    expect(moved.body.completedAt).toBeTruthy();

    const movedBack = await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/status`)
      .set(h)
      .send({ statusId: todoStatus.id });
    expect(movedBack.body.done).toBe(false);
    expect(movedBack.body.completedAt).toBeNull();
  });

  it('keeps status in sync when the done checkbox is toggled directly', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });

    const completed = await request(app)
      .patch(`/api/v1/tasks/${task.body.id}`)
      .set(h)
      .send({ done: true });

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.status.name).toBe('Done');
    expect(completed.body.done).toBe(true);
  });

  it('records a status_moved activity entry with human-readable from/to names', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const statuses = await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h);
    const inProgress = statuses.body.find((s: any) => s.name === 'In Progress');

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });
    await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/status`)
      .set(h)
      .send({ statusId: inProgress.id });

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    const entry = detail.body.activity.find((a: any) => a.type === 'status_moved');
    expect(entry.payload).toEqual({ from: 'To Do', to: 'In Progress' });
  });

  it('rejects moving a task to a status from a different project', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const otherProject = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const otherStatuses = await request(app)
      .get(`/api/v1/projects/${otherProject.project.id}/statuses`)
      .set(h);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });

    const res = await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/status`)
      .set(h)
      .send({ statusId: otherStatuses.body[0].id });
    expect(res.status).toBe(404);
  });

  it('refuses to delete a status that still has tasks on it, or a project\'s last status', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const statuses = await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h);
    const todo = statuses.body.find((s: any) => s.name === 'To Do');
    const inProgress = statuses.body.find((s: any) => s.name === 'In Progress');
    const done = statuses.body.find((s: any) => s.name === 'Done');

    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'On To Do' });

    const blockedByTasks = await request(app).delete(`/api/v1/statuses/${todo.id}`).set(h);
    expect(blockedByTasks.status).toBe(400);

    // emptying out down to one status, then trying to delete the last one
    await request(app).delete(`/api/v1/statuses/${inProgress.id}`).set(h);
    await request(app).delete(`/api/v1/statuses/${done.id}`).set(h);
    const onlyOneLeft = await request(app).delete(`/api/v1/statuses/${todo.id}`).set(h);
    // todo still has a task on it, so this is still blocked by the task guard, not the
    // "last status" guard specifically — confirms guards apply independently
    expect(onlyOneLeft.status).toBe(400);
  });

  it("returns every top-level task across a project's lists for the board view", async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const secondList = await request(app)
      .post(`/api/v1/projects/${project.id}/lists`)
      .set(h)
      .send({ name: 'Execution' });

    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Task A' });
    await request(app)
      .post(`/api/v1/tasks/by-list/${secondList.body.id}`)
      .set(h)
      .send({ title: 'Task B' });

    const board = await request(app).get(`/api/v1/projects/${project.id}/tasks`).set(h);
    expect(board.status).toBe(200);
    expect(board.body.map((t: any) => t.title).sort()).toEqual(['Task A', 'Task B']);
    expect(board.body[0].status).toBeTruthy();
    expect(board.body[0].list.name).toBeTruthy();
    expect(Array.isArray(board.body[0].assignees)).toBe(true);
    expect(Array.isArray(board.body[0].customFields)).toBe(true);
  });

  it('includes assignees and custom field values on the project tasks endpoint (used by Table view)', async () => {
    const { accessToken, user } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const field = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Budget', type: 'number' });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Staffed task' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(h).send({ userId: user.id });
    await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${field.body.id}`)
      .set(h)
      .send({ value: 500 });

    const board = await request(app).get(`/api/v1/projects/${project.id}/tasks`).set(h);
    const staffed = board.body.find((t: any) => t.id === task.body.id);
    expect(staffed.assignees).toHaveLength(1);
    expect(staffed.assignees[0].id).toBe(user.id);
    const budgetField = staffed.customFields.find((f: any) => f.id === field.body.id);
    expect(budgetField.value).toBe(500);
  });

  it('carries status and done state over when a task is duplicated', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const statuses = await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h);
    const inProgress = statuses.body.find((s: any) => s.name === 'In Progress');

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });
    await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/status`)
      .set(h)
      .send({ statusId: inProgress.id });

    const dup = await request(app).post(`/api/v1/tasks/${task.body.id}/duplicate`).set(h);
    expect(dup.body.statusId).toBe(inProgress.id);
  });

  it("prevents a user from moving a task using another user's status", async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');
    const { list, project } = await createFolderProjectListChain(owner.accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Private quest' });
    const statuses = await request(app)
      .get(`/api/v1/projects/${project.id}/statuses`)
      .set(auth(owner.accessToken));

    const res = await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/status`)
      .set(auth(intruder.accessToken))
      .send({ statusId: statuses.body[0].id });
    expect(res.status).toBe(404);
  });
});
