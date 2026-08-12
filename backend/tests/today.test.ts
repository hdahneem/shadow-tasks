import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function createTask(token: string, listId: string, title: string) {
  return request(app).post(`/api/v1/tasks/by-list/${listId}`).set(auth(token)).send({ title });
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('today list entries', () => {
  it('returns an empty entry list and today\'s date for a fresh account', async () => {
    const owner = await registerAndLogin('today-owner1@example.com');

    const res = await request(app).get('/api/v1/today/entries').set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ date: todayKey(), entries: [] });
  });

  it('adds a task to today\'s list and reflects it back on GET', async () => {
    const owner = await registerAndLogin('today-owner2@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const task = await createTask(owner.accessToken, list.id, 'Slay the boss');

    const add = await request(app)
      .post('/api/v1/today/entries')
      .set(auth(owner.accessToken))
      .send({ taskId: task.body.id, status: 'added' });
    expect(add.status).toBe(200);
    expect(add.body).toEqual({ taskId: task.body.id, status: 'added' });

    const list2 = await request(app).get('/api/v1/today/entries').set(auth(owner.accessToken));
    expect(list2.body.entries).toEqual([{ taskId: task.body.id, status: 'added' }]);
  });

  it('dismissing overwrites a prior "added" entry for the same task and day instead of creating a duplicate', async () => {
    const owner = await registerAndLogin('today-owner3@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const task = await createTask(owner.accessToken, list.id, 'Slay the boss');

    await request(app)
      .post('/api/v1/today/entries')
      .set(auth(owner.accessToken))
      .send({ taskId: task.body.id, status: 'added' });
    const dismiss = await request(app)
      .post('/api/v1/today/entries')
      .set(auth(owner.accessToken))
      .send({ taskId: task.body.id, status: 'dismissed' });
    expect(dismiss.status).toBe(200);
    expect(dismiss.body.status).toBe('dismissed');

    const res = await request(app).get('/api/v1/today/entries').set(auth(owner.accessToken));
    expect(res.body.entries).toEqual([{ taskId: task.body.id, status: 'dismissed' }]);
  });

  it('rejects an unknown task id', async () => {
    const owner = await registerAndLogin('today-owner4@example.com');

    const res = await request(app)
      .post('/api/v1/today/entries')
      .set(auth(owner.accessToken))
      .send({ taskId: '00000000-0000-0000-0000-000000000000', status: 'added' });
    expect(res.status).toBe(404);
  });

  it('rejects adding a task the caller cannot see (not a workspace member)', async () => {
    const owner = await registerAndLogin('today-owner5@example.com');
    const outsider = await registerAndLogin('today-outsider5@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const task = await createTask(owner.accessToken, list.id, 'Slay the boss');

    const res = await request(app)
      .post('/api/v1/today/entries')
      .set(auth(outsider.accessToken))
      .send({ taskId: task.body.id, status: 'added' });
    expect(res.status).toBe(404);
  });

  it('lets a viewer add a task to their own today list without needing edit access', async () => {
    const owner = await registerAndLogin('today-owner6@example.com');
    const viewer = await registerAndLogin('today-viewer6@example.com');
    const { workspace, list } = await createFolderProjectListChain(owner.accessToken);
    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'today-viewer6@example.com', role: 'viewer' });
    const task = await createTask(owner.accessToken, list.id, 'Slay the boss');

    const res = await request(app)
      .post('/api/v1/today/entries')
      .set(auth(viewer.accessToken))
      .send({ taskId: task.body.id, status: 'added' });
    expect(res.status).toBe(200);
  });

  it('keeps each user\'s today list separate', async () => {
    const owner = await registerAndLogin('today-owner7@example.com');
    const member = await registerAndLogin('today-member7@example.com');
    const { workspace, list } = await createFolderProjectListChain(owner.accessToken);
    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'today-member7@example.com', role: 'member' });
    const task = await createTask(owner.accessToken, list.id, 'Slay the boss');

    await request(app)
      .post('/api/v1/today/entries')
      .set(auth(owner.accessToken))
      .send({ taskId: task.body.id, status: 'added' });

    const memberView = await request(app).get('/api/v1/today/entries').set(auth(member.accessToken));
    expect(memberView.body.entries).toEqual([]);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/api/v1/today/entries');
    expect(res.status).toBe(401);
  });

  it('rejects an invalid status value', async () => {
    const owner = await registerAndLogin('today-owner8@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const task = await createTask(owner.accessToken, list.id, 'Slay the boss');

    const res = await request(app)
      .post('/api/v1/today/entries')
      .set(auth(owner.accessToken))
      .send({ taskId: task.body.id, status: 'archived' });
    expect(res.status).toBe(400);
  });
});
