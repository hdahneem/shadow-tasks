import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('task relations', () => {
  it('creates a relation and shows it as-is on the source and inverted on the target', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const initiative = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the Red Gate Initiative' });
    const project = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Scout the entrance' });

    const created = await request(app)
      .post(`/api/v1/tasks/${project.body.id}/relations`)
      .set(h)
      .send({ relatedTaskId: initiative.body.id, type: 'parent_initiative' });

    expect(created.status).toBe(201);
    expect(created.body.type).toBe('parent_initiative');
    expect(created.body.task.id).toBe(initiative.body.id);

    const projectDetail = await request(app).get(`/api/v1/tasks/${project.body.id}`).set(h);
    expect(projectDetail.body.relatedTasks).toEqual([
      expect.objectContaining({ type: 'parent_initiative', task: expect.objectContaining({ id: initiative.body.id }) }),
    ]);

    const initiativeDetail = await request(app).get(`/api/v1/tasks/${initiative.body.id}`).set(h);
    expect(initiativeDetail.body.relatedTasks).toEqual([
      expect.objectContaining({ type: 'child_project', task: expect.objectContaining({ id: project.body.id }) }),
    ]);
  });

  it('shows a symmetric type identically from both sides', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const a = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Bug report' });
    const b = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Fix login flow' });

    await request(app)
      .post(`/api/v1/tasks/${b.body.id}/relations`)
      .set(h)
      .send({ relatedTaskId: a.body.id, type: 'bug' });

    const aDetail = await request(app).get(`/api/v1/tasks/${a.body.id}`).set(h);
    const bDetail = await request(app).get(`/api/v1/tasks/${b.body.id}`).set(h);
    expect(aDetail.body.relatedTasks[0].type).toBe('bug');
    expect(bDetail.body.relatedTasks[0].type).toBe('bug');
  });

  it('rejects a self-relation', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Solo quest' });
    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/relations`)
      .set(h)
      .send({ relatedTaskId: task.body.id });
    expect(res.status).toBe(400);
  });

  it('rejects a duplicate link regardless of which side it is created from', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const a = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'A' });
    const b = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'B' });

    await request(app).post(`/api/v1/tasks/${a.body.id}/relations`).set(h).send({ relatedTaskId: b.body.id });

    const sameDirection = await request(app)
      .post(`/api/v1/tasks/${a.body.id}/relations`)
      .set(h)
      .send({ relatedTaskId: b.body.id });
    expect(sameDirection.status).toBe(409);

    const reverseDirection = await request(app)
      .post(`/api/v1/tasks/${b.body.id}/relations`)
      .set(h)
      .send({ relatedTaskId: a.body.id });
    expect(reverseDirection.status).toBe(409);
  });

  it('deletes a relation from either side', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const a = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'A' });
    const b = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'B' });
    const created = await request(app)
      .post(`/api/v1/tasks/${a.body.id}/relations`)
      .set(h)
      .send({ relatedTaskId: b.body.id });

    const deleted = await request(app).delete(`/api/v1/relations/${created.body.id}`).set(h);
    expect(deleted.status).toBe(204);

    const aDetail = await request(app).get(`/api/v1/tasks/${a.body.id}`).set(h);
    const bDetail = await request(app).get(`/api/v1/tasks/${b.body.id}`).set(h);
    expect(aDetail.body.relatedTasks).toHaveLength(0);
    expect(bDetail.body.relatedTasks).toHaveLength(0);
  });

  it("rejects creating or deleting relations for a workspace the user doesn't belong to", async () => {
    const owner = await registerAndLogin('owner@example.com');
    const outsider = await registerAndLogin('outsider@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);

    const a = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'A' });
    const b = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'B' });

    const createRes = await request(app)
      .post(`/api/v1/tasks/${a.body.id}/relations`)
      .set(auth(outsider.accessToken))
      .send({ relatedTaskId: b.body.id });
    expect(createRes.status).toBe(404);

    const created = await request(app)
      .post(`/api/v1/tasks/${a.body.id}/relations`)
      .set(ownerAuth)
      .send({ relatedTaskId: b.body.id });

    const deleteRes = await request(app)
      .delete(`/api/v1/relations/${created.body.id}`)
      .set(auth(outsider.accessToken));
    expect(deleteRes.status).toBe(404);
  });
});
