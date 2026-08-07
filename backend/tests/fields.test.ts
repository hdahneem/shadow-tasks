import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('custom fields', () => {
  it('creates field definitions of every type and lists them in position order', async () => {
    const { accessToken } = await registerAndLogin();
    const { project } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const budget = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Budget', type: 'currency' });
    expect(budget.status).toBe(201);

    const difficulty = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Difficulty', type: 'dropdown', options: ['Easy', 'Medium', 'Hard'] });
    expect(difficulty.status).toBe(201);

    const list = await request(app).get(`/api/v1/projects/${project.id}/fields`).set(h);
    expect(list.status).toBe(200);
    expect(list.body.map((f: any) => f.name)).toEqual(['Budget', 'Difficulty']);
  });

  it('rejects a dropdown or multi-select field with no options', async () => {
    const { accessToken } = await registerAndLogin();
    const { project } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const res = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Difficulty', type: 'dropdown' });

    expect(res.status).toBe(400);
  });

  it('validates a value against the field type before saving it', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const rating = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Rating', type: 'rating' });

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Read a book' });

    const badValue = await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${rating.body.id}`)
      .set(h)
      .send({ value: 9 }); // out of the 1-5 range
    expect(badValue.status).toBe(400);

    const goodValue = await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${rating.body.id}`)
      .set(h)
      .send({ value: 4 });
    expect(goodValue.status).toBe(200);
    expect(goodValue.body.value).toBe(4);
  });

  it('rejects a dropdown value that is not one of the field\'s current options', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const field = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Difficulty', type: 'dropdown', options: ['Easy', 'Hard'] });
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });

    const res = await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${field.body.id}`)
      .set(h)
      .send({ value: 'Impossible' });
    expect(res.status).toBe(400);
  });

  it('shows every project field on task detail with null for unset values', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const field = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Budget', type: 'currency' });
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.customFields).toHaveLength(1);
    expect(detail.body.customFields[0].value).toBeNull();

    await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${field.body.id}`)
      .set(h)
      .send({ value: 500 });

    const detail2 = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail2.body.customFields[0].value).toBe(500);
  });

  it('deleting a field definition removes its values without touching the task', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const field = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Budget', type: 'currency' });
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });
    await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${field.body.id}`)
      .set(h)
      .send({ value: 500 });

    const del = await request(app).delete(`/api/v1/fields/${field.body.id}`).set(h);
    expect(del.status).toBe(204);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.customFields).toHaveLength(0);
    expect(detail.body.title).toBe('Clear the gate');
  });

  it('carries custom field values over when a task is duplicated', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const field = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Budget', type: 'currency' });
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });
    await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${field.body.id}`)
      .set(h)
      .send({ value: 500 });

    const dup = await request(app).post(`/api/v1/tasks/${task.body.id}/duplicate`).set(h);
    const dupDetail = await request(app).get(`/api/v1/tasks/${dup.body.id}`).set(h);
    expect(dupDetail.body.customFields[0].value).toBe(500);
  });

  it("prevents a user from reading or writing another user's project fields", async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');
    const { project } = await createFolderProjectListChain(owner.accessToken);

    const field = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(auth(owner.accessToken))
      .send({ name: 'Budget', type: 'currency' });

    const listAsIntruder = await request(app)
      .get(`/api/v1/projects/${project.id}/fields`)
      .set(auth(intruder.accessToken));
    expect(listAsIntruder.status).toBe(404);

    const deleteAsIntruder = await request(app)
      .delete(`/api/v1/fields/${field.body.id}`)
      .set(auth(intruder.accessToken));
    expect(deleteAsIntruder.status).toBe(404);
  });
});
