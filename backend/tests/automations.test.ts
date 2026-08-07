import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain, getDefaultWorkspace } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('automations', () => {
  it('runs a task_created automation immediately when a task is made', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({
        name: 'Flag new quests urgent',
        triggerType: 'task_created',
        actionType: 'set_priority',
        actionConfig: { priority: 'high' },
      });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Fresh quest' });
    expect(task.body.priority).toBe('high');
  });

  it('only fires a status_changed_to automation when the task lands on the configured status', async () => {
    const { accessToken, user } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const statuses = await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h);
    const inProgress = statuses.body.find((s: { name: string }) => s.name === 'In Progress');
    const done = statuses.body.find((s: { name: string }) => s.name === 'Done');

    await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({
        name: 'Self-assign on In Progress',
        triggerType: 'status_changed_to',
        triggerConfig: { statusId: inProgress.id },
        actionType: 'assign_user',
        actionConfig: { userId: user.id },
      });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest' });

    // moving to Done (not the configured status) must NOT fire the automation
    await request(app).patch(`/api/v1/tasks/${task.body.id}/status`).set(h).send({ statusId: done.id });
    const afterDone = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(afterDone.body.assignees).toHaveLength(0);

    // moving to In Progress (the configured status) fires it
    await request(app).patch(`/api/v1/tasks/${task.body.id}/status`).set(h).send({ statusId: inProgress.id });
    const afterInProgress = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(afterInProgress.body.assignees).toHaveLength(1);
    expect(afterInProgress.body.assignees[0].id).toBe(user.id);
  });

  it('runs a task_completed automation when a task is marked done via the checkbox path', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({
        name: 'Celebrate completion',
        triggerType: 'task_completed',
        actionType: 'add_comment',
        actionConfig: { body: 'GG, quest cleared!' },
      });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest' });
    await request(app).patch(`/api/v1/tasks/${task.body.id}`).set(h).send({ done: true });

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.comments.some((c: { body: string }) => c.body === 'GG, quest cleared!')).toBe(true);
  });

  it('does not run a disabled automation', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const created = await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({
        name: 'Disabled rule',
        triggerType: 'task_created',
        actionType: 'set_priority',
        actionConfig: { priority: 'high' },
      });
    await request(app).patch(`/api/v1/automations/${created.body.id}`).set(h).send({ enabled: false });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest' });
    expect(task.body.priority).toBe('medium');
  });

  it("does not let an automation's own side effect re-trigger another automation", async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const statuses = await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h);
    const done = statuses.body.find((s: { name: string }) => s.name === 'Done');

    // A: on task_completed, jump status to Done
    await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({
        name: 'A: complete -> set status Done',
        triggerType: 'task_completed',
        actionType: 'set_status',
        actionConfig: { statusId: done.id },
      });
    // B: on status_changed_to Done, add a comment (should NOT fire from A's own status change)
    await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({
        name: 'B: status Done -> comment',
        triggerType: 'status_changed_to',
        triggerConfig: { statusId: done.id },
        actionType: 'add_comment',
        actionConfig: { body: 'Chain reaction comment' },
      });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest' });
    await request(app).patch(`/api/v1/tasks/${task.body.id}`).set(h).send({ done: true });

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.statusId).toBe(done.id);
    expect(detail.body.comments.some((c: { body: string }) => c.body === 'Chain reaction comment')).toBe(false);
  });

  it('rejects a viewer from creating or listing automations', async () => {
    const owner = await registerAndLogin('owner3@example.com');
    const viewer = await registerAndLogin('viewer3@example.com');
    const { project } = await createFolderProjectListChain(owner.accessToken);
    const workspace = await getDefaultWorkspace(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'viewer3@example.com', role: 'viewer' });

    const list = await request(app)
      .get(`/api/v1/projects/${project.id}/automations`)
      .set(auth(viewer.accessToken));
    expect(list.status).toBe(403);

    const create = await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(auth(viewer.accessToken))
      .send({ name: 'Nope', triggerType: 'task_created', actionType: 'set_priority', actionConfig: { priority: 'high' } });
    expect(create.status).toBe(403);
  });

  it('runs an assignee_added automation when a user is assigned to a task', async () => {
    const { accessToken, user } = await registerAndLogin();
    const { project, list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({
        name: 'Welcome new assignee',
        triggerType: 'assignee_added',
        actionType: 'add_comment',
        actionConfig: { body: 'Welcome to the quest!' },
      });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest' });
    // creating the task itself must not fire an assignee_added automation
    const beforeAssign = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(beforeAssign.body.comments).toHaveLength(0);

    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(h).send({ userId: user.id });

    const afterAssign = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(afterAssign.body.comments.some((c: { body: string }) => c.body === 'Welcome to the quest!')).toBe(true);
  });

  it('runs an add_tag automation, attaching the configured tag to the matching task', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list, workspace } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const tag = await request(app)
      .post('/api/v1/tags')
      .set(h)
      .send({ workspaceId: workspace.id, name: 'Auto-Tagged', color: '#22d3ee' });

    await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({
        name: 'Tag new quests',
        triggerType: 'task_created',
        actionType: 'add_tag',
        actionConfig: { tagId: tag.body.id },
      });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Fresh quest' });
    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.tags.map((t: { name: string }) => t.name)).toEqual(['Auto-Tagged']);
  });

  it('an add_tag automation is a no-op (not an error) when the task is already tagged', async () => {
    const { accessToken } = await registerAndLogin();
    const { project, list, workspace } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const tag = await request(app)
      .post('/api/v1/tags')
      .set(h)
      .send({ workspaceId: workspace.id, name: 'Repeatable', color: '#4ade80' });

    await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({
        name: 'Tag on In Progress',
        triggerType: 'status_changed_to',
        triggerConfig: { statusId: (await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h)).body.find((s: { name: string }) => s.name === 'In Progress').id },
        actionType: 'add_tag',
        actionConfig: { tagId: tag.body.id },
      });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/tags`).set(h).send({ tagId: tag.body.id });

    const statuses = await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h);
    const inProgress = statuses.body.find((s: { name: string }) => s.name === 'In Progress');
    const moved = await request(app).patch(`/api/v1/tasks/${task.body.id}/status`).set(h).send({ statusId: inProgress.id });
    expect(moved.status).toBe(200);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.tags).toHaveLength(1);
  });

  it('an add_tag automation ignores a tag that belongs to a different workspace', async () => {
    const first = await registerAndLogin('tagowner1@example.com');
    const { project, list } = await createFolderProjectListChain(first.accessToken);
    const h = auth(first.accessToken);

    const other = await registerAndLogin('tagowner2@example.com');
    const otherWorkspace = await getDefaultWorkspace(other.accessToken);
    const foreignTag = await request(app)
      .post('/api/v1/tags')
      .set(auth(other.accessToken))
      .send({ workspaceId: otherWorkspace.id, name: 'Foreign', color: '#f43f5e' });

    await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({
        name: 'Tag with foreign tag',
        triggerType: 'task_created',
        actionType: 'add_tag',
        actionConfig: { tagId: foreignTag.body.id },
      });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest' });
    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.tags).toHaveLength(0);
  });

  it('deletes an automation', async () => {
    const { accessToken } = await registerAndLogin();
    const { project } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const created = await request(app)
      .post(`/api/v1/projects/${project.id}/automations`)
      .set(h)
      .send({ name: 'To delete', triggerType: 'task_created', actionType: 'set_priority', actionConfig: { priority: 'low' } });

    const del = await request(app).delete(`/api/v1/automations/${created.body.id}`).set(h);
    expect(del.status).toBe(204);

    const list = await request(app).get(`/api/v1/projects/${project.id}/automations`).set(h);
    expect(list.body).toHaveLength(0);
  });
});
