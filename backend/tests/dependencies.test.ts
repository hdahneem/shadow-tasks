import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('task dependencies', () => {
  it('creates a dependency and shows it on both the predecessor and successor', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const scout = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Scout the entrance' });
    const slay = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Slay the ice elves' });

    const created = await request(app)
      .post(`/api/v1/tasks/${slay.body.id}/dependencies`)
      .set(h)
      .send({ predecessorId: scout.body.id, type: 'finish_to_start' });

    expect(created.status).toBe(201);
    expect(created.body.type).toBe('finish_to_start');
    expect(created.body.task.id).toBe(scout.body.id);

    const slayDetail = await request(app).get(`/api/v1/tasks/${slay.body.id}`).set(h);
    expect(slayDetail.body.dependsOn).toEqual([
      expect.objectContaining({ type: 'finish_to_start', task: expect.objectContaining({ id: scout.body.id }) }),
    ]);

    const scoutDetail = await request(app).get(`/api/v1/tasks/${scout.body.id}`).set(h);
    expect(scoutDetail.body.blocks).toEqual([
      expect.objectContaining({ type: 'finish_to_start', task: expect.objectContaining({ id: slay.body.id }) }),
    ]);
  });

  it('rejects a self-dependency', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Solo quest' });

    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/dependencies`)
      .set(h)
      .send({ predecessorId: task.body.id });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate dependency', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const a = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'A' });
    const b = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'B' });

    await request(app).post(`/api/v1/tasks/${b.body.id}/dependencies`).set(h).send({ predecessorId: a.body.id });
    const dup = await request(app)
      .post(`/api/v1/tasks/${b.body.id}/dependencies`)
      .set(h)
      .send({ predecessorId: a.body.id });
    expect(dup.status).toBe(409);
  });

  it('rejects a dependency that would create a cycle', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const a = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'A' });
    const b = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'B' });
    const c = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'C' });

    // A -> B -> C (A must finish before B, B must finish before C)
    await request(app).post(`/api/v1/tasks/${b.body.id}/dependencies`).set(h).send({ predecessorId: a.body.id });
    await request(app).post(`/api/v1/tasks/${c.body.id}/dependencies`).set(h).send({ predecessorId: b.body.id });

    // C -> A would close the loop
    const cyclic = await request(app)
      .post(`/api/v1/tasks/${a.body.id}/dependencies`)
      .set(h)
      .send({ predecessorId: c.body.id });
    expect(cyclic.status).toBe(400);
  });

  it('blocks completion via the done toggle while a finish-to-start predecessor is unresolved', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const scout = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Scout the entrance' });
    const slay = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Slay the ice elves' });
    await request(app)
      .post(`/api/v1/tasks/${slay.body.id}/dependencies`)
      .set(h)
      .send({ predecessorId: scout.body.id });

    const blocked = await request(app).patch(`/api/v1/tasks/${slay.body.id}`).set(h).send({ done: true });
    expect(blocked.status).toBe(400);
    expect(blocked.body.blockedBy).toHaveLength(1);

    await request(app).patch(`/api/v1/tasks/${scout.body.id}`).set(h).send({ done: true });
    const allowed = await request(app).patch(`/api/v1/tasks/${slay.body.id}`).set(h).send({ done: true });
    expect(allowed.status).toBe(200);
    expect(allowed.body.done).toBe(true);
  });

  it('blocks completion via a status move to a completed status', async () => {
    const { accessToken } = await registerAndLogin();
    const { list, project } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const statuses = await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h);
    const doneStatus = statuses.body.find((s: { isCompleted: boolean }) => s.isCompleted);

    const scout = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Scout the entrance' });
    const slay = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Slay the ice elves' });
    await request(app)
      .post(`/api/v1/tasks/${slay.body.id}/dependencies`)
      .set(h)
      .send({ predecessorId: scout.body.id });

    const blocked = await request(app)
      .patch(`/api/v1/tasks/${slay.body.id}/status`)
      .set(h)
      .send({ statusId: doneStatus.id });
    expect(blocked.status).toBe(400);
  });

  it('does not block completion when only a start-to-start dependency is unresolved', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const a = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'A' });
    const b = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'B' });
    await request(app)
      .post(`/api/v1/tasks/${b.body.id}/dependencies`)
      .set(h)
      .send({ predecessorId: a.body.id, type: 'start_to_start' });

    const res = await request(app).patch(`/api/v1/tasks/${b.body.id}`).set(h).send({ done: true });
    expect(res.status).toBe(200);
  });

  it('deletes a dependency', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const a = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'A' });
    const b = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'B' });
    const created = await request(app)
      .post(`/api/v1/tasks/${b.body.id}/dependencies`)
      .set(h)
      .send({ predecessorId: a.body.id });

    const deleted = await request(app).delete(`/api/v1/dependencies/${created.body.id}`).set(h);
    expect(deleted.status).toBe(204);

    const bDetail = await request(app).get(`/api/v1/tasks/${b.body.id}`).set(h);
    expect(bDetail.body.dependsOn).toHaveLength(0);

    const res = await request(app).patch(`/api/v1/tasks/${b.body.id}`).set(h).send({ done: true });
    expect(res.status).toBe(200);
  });

  it("rejects creating or deleting dependencies for a workspace the user doesn't belong to", async () => {
    const owner = await registerAndLogin('owner@example.com');
    const outsider = await registerAndLogin('outsider@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);

    const a = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'A' });
    const b = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'B' });

    const createRes = await request(app)
      .post(`/api/v1/tasks/${b.body.id}/dependencies`)
      .set(auth(outsider.accessToken))
      .send({ predecessorId: a.body.id });
    expect(createRes.status).toBe(404);

    const created = await request(app)
      .post(`/api/v1/tasks/${b.body.id}/dependencies`)
      .set(ownerAuth)
      .send({ predecessorId: a.body.id });

    const deleteRes = await request(app)
      .delete(`/api/v1/dependencies/${created.body.id}`)
      .set(auth(outsider.accessToken));
    expect(deleteRes.status).toBe(404);
  });
});
