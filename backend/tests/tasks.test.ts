import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('tasks & subtasks', () => {
  it('creates a task on a list', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);

    const res = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(accessToken))
      .send({ title: 'Slay the ice elves', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Slay the ice elves');
    expect(res.body.priority).toBe('high');
    expect(res.body.progress).toBe(0);
  });

  it('rolls up subtask progress to the parent, including multi-level nesting', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const parent = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });

    const childA = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Scout entrance', parentTaskId: parent.body.id });

    const childB = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Defeat boss', parentTaskId: parent.body.id });

    // grandchild under childB
    const grandchild = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Break the shield', parentTaskId: childB.body.id });

    // nothing done yet -> 0%
    let detail = await request(app).get(`/api/v1/tasks/${parent.body.id}`).set(h);
    expect(detail.body.progress).toBe(0);

    // complete childA (one of two top-level children) -> parent should be 50%
    await request(app).patch(`/api/v1/tasks/${childA.body.id}`).set(h).send({ done: true });
    detail = await request(app).get(`/api/v1/tasks/${parent.body.id}`).set(h);
    expect(detail.body.progress).toBe(50);

    // complete the grandchild -> childB's subtree is 100%, so parent is 100%
    await request(app).patch(`/api/v1/tasks/${grandchild.body.id}`).set(h).send({ done: true });
    detail = await request(app).get(`/api/v1/tasks/${parent.body.id}`).set(h);
    expect(detail.body.progress).toBe(100);
    expect(detail.body.subtasks).toHaveLength(2);
    const childBNode = detail.body.subtasks.find((s: any) => s.id === childB.body.id);
    expect(childBNode.children).toHaveLength(1);
    expect(childBNode.progress).toBe(100);
  });

  it('prevents moving a task underneath its own descendant (cycle prevention)', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const parent = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Parent' });
    const child = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Child', parentTaskId: parent.body.id });

    const res = await request(app)
      .patch(`/api/v1/tasks/${parent.body.id}/reorder`)
      .set(h)
      .send({ parentTaskId: child.body.id, position: 1 });

    expect(res.status).toBe(400);
  });

  it('logs activity for creation, status change, and comments', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Slay the ice elves' });

    await request(app).patch(`/api/v1/tasks/${task.body.id}`).set(h).send({ done: true });
    await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(h)
      .send({ body: 'Bring extra daggers.' });

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    const types = detail.body.activity.map((a: any) => a.type);
    expect(types).toContain('task_created');
    expect(types).toContain('status_changed');
    expect(types).toContain('comment_added');
    expect(detail.body.comments).toHaveLength(1);
  });

  it('duplicates a task along with its subtasks, without carrying over comments', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });
    await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Scout entrance', parentTaskId: task.body.id });
    await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(h)
      .send({ body: 'note' });

    const dup = await request(app).post(`/api/v1/tasks/${task.body.id}/duplicate`).set(h);
    expect(dup.status).toBe(201);
    expect(dup.body.title).toBe('Clear the gate (copy)');

    const dupDetail = await request(app).get(`/api/v1/tasks/${dup.body.id}`).set(h);
    expect(dupDetail.body.subtasks).toHaveLength(1);
    expect(dupDetail.body.subtasks[0].title).toBe('Scout entrance');
    expect(dupDetail.body.comments).toHaveLength(0);
  });

  it('archives and restores a task', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });

    await request(app).post(`/api/v1/tasks/${task.body.id}/archive`).set(h);

    let listing = await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(h);
    expect(listing.body).toHaveLength(0);

    await request(app).post(`/api/v1/tasks/${task.body.id}/restore`).set(h);
    listing = await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(h);
    expect(listing.body).toHaveLength(1);
  });

  it('shows archived tasks via ?archived=true and excludes them from the default listing', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const active = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Still active' });
    const archived = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Old quest' });
    await request(app).post(`/api/v1/tasks/${archived.body.id}/archive`).set(h);

    const defaultListing = await request(app).get('/api/v1/tasks?includeDone=true').set(h);
    expect(defaultListing.body.map((t: { id: string }) => t.id)).toEqual([active.body.id]);

    const archivedListing = await request(app).get('/api/v1/tasks?archived=true').set(h);
    expect(archivedListing.body.map((t: { id: string }) => t.id)).toEqual([archived.body.id]);
  });

  it("prevents a user from reading another user's task", async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Private quest' });

    const res = await request(app)
      .get(`/api/v1/tasks/${task.body.id}`)
      .set(auth(intruder.accessToken));

    expect(res.status).toBe(404);
  });
});

describe('GET /tasks pagination', () => {
  it('returns a bare array when no page params are given (back-compat)', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);
    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Solo quest' });

    const res = await request(app).get('/api/v1/tasks').set(h);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it('paginates results with correct total, and walking every page covers every task exactly once', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const titles = ['Quest A', 'Quest B', 'Quest C', 'Quest D', 'Quest E'];
    for (const title of titles) {
      await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title });
    }

    const page1 = await request(app).get('/api/v1/tasks?page=1&pageSize=2').set(h);
    expect(page1.status).toBe(200);
    expect(page1.body.tasks).toHaveLength(2);
    expect(page1.body.total).toBe(5);
    expect(page1.body.page).toBe(1);
    expect(page1.body.pageSize).toBe(2);

    const page2 = await request(app).get('/api/v1/tasks?page=2&pageSize=2').set(h);
    expect(page2.body.tasks).toHaveLength(2);

    const page3 = await request(app).get('/api/v1/tasks?page=3&pageSize=2').set(h);
    expect(page3.body.tasks).toHaveLength(1);

    const allIds = [...page1.body.tasks, ...page2.body.tasks, ...page3.body.tasks].map(
      (t: { id: string }) => t.id
    );
    expect(new Set(allIds).size).toBe(5);

    const unpaginated = await request(app).get('/api/v1/tasks').set(h);
    expect(new Set(allIds)).toEqual(new Set(unpaginated.body.map((t: { id: string }) => t.id)));
  });

  it('respects includeDone/archived filters in the paginated total', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const active = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Active' });
    const done = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Done' });
    await request(app).patch(`/api/v1/tasks/${done.body.id}`).set(h).send({ done: true });
    const archived = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Archived' });
    await request(app).post(`/api/v1/tasks/${archived.body.id}/archive`).set(h);

    const activeOnly = await request(app).get('/api/v1/tasks?page=1&pageSize=10').set(h);
    expect(activeOnly.body.total).toBe(1);
    expect(activeOnly.body.tasks[0].id).toBe(active.body.id);

    const includeDone = await request(app).get('/api/v1/tasks?includeDone=true&page=1&pageSize=10').set(h);
    expect(includeDone.body.total).toBe(2);

    const archivedOnly = await request(app).get('/api/v1/tasks?archived=true&page=1&pageSize=10').set(h);
    expect(archivedOnly.body.total).toBe(1);
    expect(archivedOnly.body.tasks[0].id).toBe(archived.body.id);
  });

  it('clamps out-of-range page/pageSize values', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);
    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Solo quest' });

    const hugePageSize = await request(app).get('/api/v1/tasks?page=1&pageSize=1000').set(h);
    expect(hugePageSize.body.pageSize).toBe(100);

    const zeroPageSize = await request(app).get('/api/v1/tasks?page=1&pageSize=0').set(h);
    expect(zeroPageSize.body.pageSize).toBe(1);

    const zeroPage = await request(app).get('/api/v1/tasks?page=0&pageSize=10').set(h);
    expect(zeroPage.body.page).toBe(1);
  });

  it("excludes another user's tasks from paginated results and total", async () => {
    const owner = await registerAndLogin('owner3@example.com');
    const intruder = await registerAndLogin('intruder3@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Private quest' });

    const res = await request(app).get('/api/v1/tasks?page=1&pageSize=10').set(auth(intruder.accessToken));
    expect(res.body.total).toBe(0);
    expect(res.body.tasks).toHaveLength(0);
  });
});

describe('GET /tasks/sync-status', () => {
  it('reports null lastModifiedAt and zero count with no tasks', async () => {
    const { accessToken } = await registerAndLogin();
    await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const res = await request(app).get('/api/v1/tasks/sync-status').set(h);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ lastModifiedAt: null, count: 0 });
  });

  it('tracks count and lastModifiedAt as tasks are created and updated', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const first = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'First quest' });
    const afterFirst = await request(app).get('/api/v1/tasks/sync-status').set(h);
    expect(afterFirst.body.count).toBe(1);
    expect(afterFirst.body.lastModifiedAt).toBeTruthy();

    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Second quest' });
    const afterSecond = await request(app).get('/api/v1/tasks/sync-status').set(h);
    expect(afterSecond.body.count).toBe(2);

    await request(app).patch(`/api/v1/tasks/${first.body.id}`).set(h).send({ title: 'First quest, renamed' });
    const afterUpdate = await request(app).get('/api/v1/tasks/sync-status').set(h);
    expect(afterUpdate.body.count).toBe(2);
    expect(new Date(afterUpdate.body.lastModifiedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(afterSecond.body.lastModifiedAt).getTime()
    );
  });

  it('detects a deletion via the count even when lastModifiedAt does not advance', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    // "keeper" is created last, so it holds the highest updatedAt of the two —
    // deleting "toDelete" (the older row) removes a task without touching
    // lastModifiedAt, proving count is needed alongside it to catch deletions.
    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'To delete' });
    const toDelete = (await request(app).get('/api/v1/tasks').set(h)).body.find(
      (t: { title: string }) => t.title === 'To delete'
    );
    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Keeper' });

    const before = await request(app).get('/api/v1/tasks/sync-status').set(h);
    expect(before.body.count).toBe(2);

    await request(app).delete(`/api/v1/tasks/${toDelete.id}`).set(h);

    const after = await request(app).get('/api/v1/tasks/sync-status').set(h);
    expect(after.body.count).toBe(1);
    expect(after.body.lastModifiedAt).toBe(before.body.lastModifiedAt);
  });

  it('respects includeDone/archived filters the same way as the main listing', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Active' });
    const done = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Done' });
    await request(app).patch(`/api/v1/tasks/${done.body.id}`).set(h).send({ done: true });
    const archived = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Archived' });
    await request(app).post(`/api/v1/tasks/${archived.body.id}/archive`).set(h);

    const activeOnly = await request(app).get('/api/v1/tasks/sync-status').set(h);
    expect(activeOnly.body.count).toBe(1);

    const includeDone = await request(app).get('/api/v1/tasks/sync-status?includeDone=true').set(h);
    expect(includeDone.body.count).toBe(2);

    const archivedOnly = await request(app).get('/api/v1/tasks/sync-status?archived=true').set(h);
    expect(archivedOnly.body.count).toBe(1);
  });

  it("excludes another user's tasks from the signature", async () => {
    const owner = await registerAndLogin('owner4@example.com');
    const intruder = await registerAndLogin('intruder4@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Private quest' });

    const res = await request(app).get('/api/v1/tasks/sync-status').set(auth(intruder.accessToken));
    expect(res.body).toEqual({ lastModifiedAt: null, count: 0 });
  });
});
