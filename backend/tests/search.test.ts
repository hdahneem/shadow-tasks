import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('search', () => {
  it('matches tasks by title', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Slay the ice elves' });
    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Scout the entrance' });

    const res = await request(app).get('/api/v1/search?q=ice elves').set(h);
    expect(res.status).toBe(200);
    expect(res.body.tasks.map((t: any) => t.title)).toEqual(['Slay the ice elves']);
  });

  it('matches tasks by description, case-insensitively', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate', description: 'Bring extra DAGGERS and a shield' });

    const res = await request(app).get('/api/v1/search?q=daggers').set(h);
    expect(res.body.tasks).toHaveLength(1);
  });

  it('matches comments and returns the parent task context', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate' });
    await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(h)
      .send({ body: 'Watch out for the frost golem' });

    const res = await request(app).get('/api/v1/search?q=frost golem').set(h);
    expect(res.body.comments).toHaveLength(1);
    expect(res.body.comments[0].task.id).toBe(task.body.id);
    expect(res.body.comments[0].task.title).toBe('Clear the gate');
  });

  it('filters by priority and done state, combined with a text query', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const a = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the red gate', priority: 'high' });
    await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the blue gate', priority: 'low' });

    const res = await request(app).get('/api/v1/search?q=gate&priority=high').set(h);
    expect(res.body.tasks.map((t: any) => t.id)).toEqual([a.body.id]);

    await request(app).patch(`/api/v1/tasks/${a.body.id}`).set(h).send({ done: true });
    const doneOnly = await request(app).get('/api/v1/search?q=gate&done=true').set(h);
    expect(doneOnly.body.tasks.map((t: any) => t.id)).toEqual([a.body.id]);
  });

  it('filters by project and by due date range', async () => {
    const { accessToken } = await registerAndLogin();
    const chainA = await createFolderProjectListChain(accessToken);
    const chainB = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const inA = await request(app)
      .post(`/api/v1/tasks/by-list/${chainA.list.id}`)
      .set(h)
      .send({ title: 'Shared name quest', dueDate: '2026-08-10T00:00:00.000Z' });
    await request(app)
      .post(`/api/v1/tasks/by-list/${chainB.list.id}`)
      .set(h)
      .send({ title: 'Shared name quest', dueDate: '2026-09-10T00:00:00.000Z' });

    const byProject = await request(app)
      .get(`/api/v1/search?q=shared name&projectId=${chainA.project.id}`)
      .set(h);
    expect(byProject.body.tasks.map((t: any) => t.id)).toEqual([inA.body.id]);

    const byDate = await request(app)
      .get('/api/v1/search?q=shared name&dueFrom=2026-08-01&dueTo=2026-08-31')
      .set(h);
    expect(byDate.body.tasks.map((t: any) => t.id)).toEqual([inA.body.id]);
  });

  it('excludes archived and subtasks from results', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const parent = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Findable parent quest' });
    await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Findable subtask', parentTaskId: parent.body.id });
    const archived = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Findable archived quest' });
    await request(app).post(`/api/v1/tasks/${archived.body.id}/archive`).set(h);

    const res = await request(app).get('/api/v1/search?q=findable').set(h);
    expect(res.body.tasks.map((t: any) => t.title)).toEqual(['Findable parent quest']);
  });

  it("never returns another user's tasks or comments", async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);

    await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Very private quest' });

    const res = await request(app).get('/api/v1/search?q=private').set(auth(intruder.accessToken));
    expect(res.body.tasks).toHaveLength(0);
  });

  it('matches docs by title', async () => {
    const { accessToken } = await registerAndLogin();
    const { workspace } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    await request(app).post('/api/v1/docs').set(h).send({ workspaceId: workspace.id, title: 'Raid Strategy Notes' });
    await request(app).post('/api/v1/docs').set(h).send({ workspaceId: workspace.id, title: 'Unrelated' });

    const res = await request(app).get('/api/v1/search?q=raid strategy').set(h);
    expect(res.body.docs.map((d: any) => d.title)).toEqual(['Raid Strategy Notes']);
  });

  it('matches docs by content, case-insensitively', async () => {
    const { accessToken } = await registerAndLogin();
    const { workspace } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const doc = await request(app)
      .post('/api/v1/docs')
      .set(h)
      .send({ workspaceId: workspace.id, title: 'Notes' });
    await request(app)
      .patch(`/api/v1/docs/${doc.body.id}`)
      .set(h)
      .send({ content: 'Remember to bring the ENCHANTED shield' });

    const res = await request(app).get('/api/v1/search?q=enchanted shield').set(h);
    expect(res.body.docs).toHaveLength(1);
    expect(res.body.docs[0].id).toBe(doc.body.id);
  });

  it('excludes docs when a projectId filter is set, since docs are workspace-scoped', async () => {
    const { accessToken } = await registerAndLogin();
    const { workspace, project } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    await request(app).post('/api/v1/docs').set(h).send({ workspaceId: workspace.id, title: 'Scoped-out doc' });

    const res = await request(app).get(`/api/v1/search?q=scoped-out&projectId=${project.id}`).set(h);
    expect(res.body.docs).toEqual([]);
  });

  it("never returns another user's docs", async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');
    const { workspace } = await createFolderProjectListChain(owner.accessToken);

    await request(app)
      .post('/api/v1/docs')
      .set(auth(owner.accessToken))
      .send({ workspaceId: workspace.id, title: 'Private battle plan' });

    const res = await request(app).get('/api/v1/search?q=battle plan').set(auth(intruder.accessToken));
    expect(res.body.docs).toHaveLength(0);
  });

  it('matches tasks by a text custom field value', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const field = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Notes', type: 'text' });
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Unremarkable title' });
    await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${field.body.id}`)
      .set(h)
      .send({ value: 'Guarded by a Dungeon Break-tier boss' });

    const res = await request(app).get('/api/v1/search?q=dungeon break').set(h);
    expect(res.body.tasks.map((t: any) => t.id)).toEqual([task.body.id]);
  });

  it('matches tasks by a dropdown custom field value', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const field = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Region', type: 'dropdown', options: ['Frozen North', 'Ashen Wastes'] });
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Unremarkable title' });
    await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${field.body.id}`)
      .set(h)
      .send({ value: 'Frozen North' });

    const res = await request(app).get('/api/v1/search?q=frozen north').set(h);
    expect(res.body.tasks.map((t: any) => t.id)).toEqual([task.body.id]);
  });

  it('does not treat a number field value as a text match', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const field = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Danger Level', type: 'number' });
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Unremarkable title' });
    await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${field.body.id}`)
      .set(h)
      .send({ value: 9 });

    const res = await request(app).get('/api/v1/search?q=9').set(h);
    expect(res.body.tasks).toHaveLength(0);
  });

  it('never matches a custom field value on another workspace member-only project the user cannot see', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');
    const { project, list } = await createFolderProjectListChain(owner.accessToken);

    const field = await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(auth(owner.accessToken))
      .send({ name: 'Notes', type: 'text' });
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Unremarkable title' });
    await request(app)
      .patch(`/api/v1/tasks/${task.body.id}/fields/${field.body.id}`)
      .set(auth(owner.accessToken))
      .send({ value: 'A secret codeword' });

    const res = await request(app).get('/api/v1/search?q=secret codeword').set(auth(intruder.accessToken));
    expect(res.body.tasks).toHaveLength(0);
  });
});

describe('saved searches', () => {
  it('creates, lists, and deletes a saved search', async () => {
    const { accessToken } = await registerAndLogin();
    const h = auth(accessToken);

    const created = await request(app)
      .post('/api/v1/saved-searches')
      .set(h)
      .send({ name: 'High priority gates', query: 'gate', filters: { priority: 'high' } });
    expect(created.status).toBe(201);

    const list = await request(app).get('/api/v1/saved-searches').set(h);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe('High priority gates');
    expect(list.body[0].filters).toEqual({ priority: 'high' });

    const del = await request(app).delete(`/api/v1/saved-searches/${created.body.id}`).set(h);
    expect(del.status).toBe(204);

    const listAfter = await request(app).get('/api/v1/saved-searches').set(h);
    expect(listAfter.body).toHaveLength(0);
  });

  it("scopes saved searches per user and rejects deleting another user's", async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');

    const created = await request(app)
      .post('/api/v1/saved-searches')
      .set(auth(owner.accessToken))
      .send({ name: 'My search' });

    const intruderList = await request(app)
      .get('/api/v1/saved-searches')
      .set(auth(intruder.accessToken));
    expect(intruderList.body).toHaveLength(0);

    const del = await request(app)
      .delete(`/api/v1/saved-searches/${created.body.id}`)
      .set(auth(intruder.accessToken));
    expect(del.status).toBe(404);
  });
});
