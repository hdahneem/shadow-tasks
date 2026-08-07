import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('project templates', () => {
  it('captures statuses, custom fields, and list names when saving a project as a template', async () => {
    const { accessToken } = await registerAndLogin();
    const { project } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    await request(app)
      .post(`/api/v1/projects/${project.id}/statuses`)
      .set(h)
      .send({ name: 'Review', color: '#facc15' });
    await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Boss Name', type: 'text' });
    await request(app).post(`/api/v1/projects/${project.id}/lists`).set(h).send({ name: 'Loot' });

    const saved = await request(app)
      .post(`/api/v1/projects/${project.id}/save-as-template`)
      .set(h)
      .send({ name: 'Dungeon Raid Template' });

    expect(saved.status).toBe(201);
    expect(saved.body.name).toBe('Dungeon Raid Template');
    expect(saved.body.statuses.map((s: { name: string }) => s.name)).toEqual(
      expect.arrayContaining(['To Do', 'In Progress', 'Done', 'Review'])
    );
    expect(saved.body.fields).toEqual([expect.objectContaining({ name: 'Boss Name', type: 'text' })]);
    expect(saved.body.listNames).toEqual(expect.arrayContaining(['Preparation', 'Loot']));
  });

  it('lists and deletes project templates, scoped per user', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');
    const { project } = await createFolderProjectListChain(owner.accessToken);

    const created = await request(app)
      .post(`/api/v1/projects/${project.id}/save-as-template`)
      .set(auth(owner.accessToken))
      .send({ name: 'My Template' });

    const intruderList = await request(app).get('/api/v1/project-templates').set(auth(intruder.accessToken));
    expect(intruderList.body).toHaveLength(0);

    const ownerList = await request(app).get('/api/v1/project-templates').set(auth(owner.accessToken));
    expect(ownerList.body).toHaveLength(1);

    const intruderDelete = await request(app)
      .delete(`/api/v1/project-templates/${created.body.id}`)
      .set(auth(intruder.accessToken));
    expect(intruderDelete.status).toBe(404);

    const ownerDelete = await request(app)
      .delete(`/api/v1/project-templates/${created.body.id}`)
      .set(auth(owner.accessToken));
    expect(ownerDelete.status).toBe(204);
  });

  it('creates a new project from a template with matching statuses, fields, and lists', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, workspace } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    await request(app)
      .post(`/api/v1/projects/${project.id}/fields`)
      .set(h)
      .send({ name: 'Reward', type: 'text' });

    const template = await request(app)
      .post(`/api/v1/projects/${project.id}/save-as-template`)
      .set(h)
      .send({ name: 'Raid Template' });

    const created = await request(app)
      .post(`/api/v1/project-templates/${template.body.id}/create-project`)
      .set(h)
      .send({ name: 'Clear the Blue Gate', rank: 'C', workspaceId: workspace.id });

    expect(created.status).toBe(201);
    expect(created.body.name).toBe('Clear the Blue Gate');
    expect(created.body.rank).toBe('C');

    const statuses = await request(app).get(`/api/v1/projects/${created.body.id}/statuses`).set(h);
    expect(statuses.body.map((s: { name: string }) => s.name)).toEqual(
      expect.arrayContaining(['To Do', 'In Progress', 'Done'])
    );

    const fields = await request(app).get(`/api/v1/projects/${created.body.id}/fields`).set(h);
    expect(fields.body).toEqual([expect.objectContaining({ name: 'Reward' })]);

    const lists = await request(app).get(`/api/v1/projects/${created.body.id}/lists`).set(h);
    expect(lists.body.map((l: { name: string }) => l.name)).toEqual(['Preparation']);
  });
});

describe('task templates', () => {
  it('captures title, description, priority, and the subtask checklist when saving a task as a template', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Scout the gate', description: 'Bring a scanner', priority: 'high' });
    const sub1 = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Check the perimeter', parentTaskId: task.body.id });
    await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Report findings', parentTaskId: sub1.body.id });

    const saved = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/save-as-template`)
      .set(h)
      .send({ name: 'Scouting Checklist' });

    expect(saved.status).toBe(201);
    expect(saved.body.title).toBe('Scout the gate');
    expect(saved.body.description).toBe('Bring a scanner');
    expect(saved.body.priority).toBe('high');
    expect(saved.body.subtasks).toEqual([
      expect.objectContaining({
        title: 'Check the perimeter',
        children: [expect.objectContaining({ title: 'Report findings', children: [] })],
      }),
    ]);
  });

  it('lists and deletes task templates, scoped per user', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Scout the gate' });
    const created = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/save-as-template`)
      .set(auth(owner.accessToken))
      .send({ name: 'My Checklist' });

    const intruderList = await request(app).get('/api/v1/task-templates').set(auth(intruder.accessToken));
    expect(intruderList.body).toHaveLength(0);

    const intruderDelete = await request(app)
      .delete(`/api/v1/task-templates/${created.body.id}`)
      .set(auth(intruder.accessToken));
    expect(intruderDelete.status).toBe(404);

    const ownerDelete = await request(app)
      .delete(`/api/v1/task-templates/${created.body.id}`)
      .set(auth(owner.accessToken));
    expect(ownerDelete.status).toBe(204);
  });

  it('creates a new task with its checklist recreated as real subtasks', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Scout the gate', priority: 'high' });
    const sub1 = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Check the perimeter', parentTaskId: task.body.id });
    await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Report findings', parentTaskId: sub1.body.id });

    const template = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/save-as-template`)
      .set(h)
      .send({ name: 'Scouting Checklist' });

    const created = await request(app)
      .post(`/api/v1/task-templates/${template.body.id}/create-task`)
      .set(h)
      .send({ listId: list.id });

    expect(created.status).toBe(201);
    expect(created.body.title).toBe('Scout the gate');
    expect(created.body.priority).toBe('high');

    const detail = await request(app).get(`/api/v1/tasks/${created.body.id}`).set(h);
    expect(detail.body.subtasks).toEqual([
      expect.objectContaining({
        title: 'Check the perimeter',
        children: [expect.objectContaining({ title: 'Report findings' })],
      }),
    ]);

    // The original task's own subtasks are untouched by instantiating the template.
    const originalDetail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(originalDetail.body.subtasks).toHaveLength(1);
  });

  it("rejects creating a task from another user's template", async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const intruderChain = await createFolderProjectListChain(intruder.accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Scout the gate' });
    const template = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/save-as-template`)
      .set(auth(owner.accessToken))
      .send({ name: 'My Checklist' });

    const res = await request(app)
      .post(`/api/v1/task-templates/${template.body.id}/create-task`)
      .set(auth(intruder.accessToken))
      .send({ listId: intruderChain.list.id });
    expect(res.status).toBe(404);
  });
});
