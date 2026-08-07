import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function inviteAsRole(ownerToken: string, workspaceId: string, email: string, role: string) {
  return request(app)
    .post(`/api/v1/workspaces/${workspaceId}/invites`)
    .set(auth(ownerToken))
    .send({ email, role });
}

async function createTag(token: string, workspaceId: string, name: string, color = '#22d3ee') {
  return request(app).post('/api/v1/tags').set(auth(token)).send({ workspaceId, name, color });
}

describe('tags', () => {
  it('lets a member create a workspace tag', async () => {
    const owner = await registerAndLogin('tag-owner1@example.com');
    const { workspace } = await createFolderProjectListChain(owner.accessToken);

    const res = await createTag(owner.accessToken, workspace.id, 'Urgent');
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: 'Urgent', color: '#22d3ee', workspaceId: workspace.id });
  });

  it('rejects tag creation from a non-member', async () => {
    const owner = await registerAndLogin('tag-owner2@example.com');
    const outsider = await registerAndLogin('tag-outsider2@example.com');
    const { workspace } = await createFolderProjectListChain(owner.accessToken);

    const res = await createTag(outsider.accessToken, workspace.id, 'Urgent');
    expect(res.status).toBe(404);
  });

  it('rejects a duplicate tag name in the same workspace', async () => {
    const owner = await registerAndLogin('tag-owner3@example.com');
    const { workspace } = await createFolderProjectListChain(owner.accessToken);

    await createTag(owner.accessToken, workspace.id, 'Urgent');
    const dupe = await createTag(owner.accessToken, workspace.id, 'Urgent');
    expect(dupe.status).toBe(409);
  });

  it('lists tags for viewer+ members', async () => {
    const owner = await registerAndLogin('tag-owner4@example.com');
    const viewer = await registerAndLogin('tag-viewer4@example.com');
    const { workspace } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'tag-viewer4@example.com', 'viewer');
    await createTag(owner.accessToken, workspace.id, 'Urgent');

    const res = await request(app).get(`/api/v1/tags?workspaceId=${workspace.id}`).set(auth(viewer.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Urgent');
  });

  it('lets an admin rename a tag but rejects a plain member', async () => {
    const owner = await registerAndLogin('tag-owner5@example.com');
    const member = await registerAndLogin('tag-member5@example.com');
    const { workspace } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'tag-member5@example.com', 'member');
    const tag = await createTag(owner.accessToken, workspace.id, 'Urgent');

    const blocked = await request(app)
      .patch(`/api/v1/tags/${tag.body.id}`)
      .set(auth(member.accessToken))
      .send({ name: 'Renamed' });
    expect(blocked.status).toBe(404);

    const allowed = await request(app)
      .patch(`/api/v1/tags/${tag.body.id}`)
      .set(auth(owner.accessToken))
      .send({ name: 'Renamed' });
    expect(allowed.status).toBe(200);
    expect(allowed.body.name).toBe('Renamed');
  });

  it('lets an admin delete a tag but rejects a plain member', async () => {
    const owner = await registerAndLogin('tag-owner6@example.com');
    const member = await registerAndLogin('tag-member6@example.com');
    const { workspace } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'tag-member6@example.com', 'member');
    const tag = await createTag(owner.accessToken, workspace.id, 'Urgent');

    const blocked = await request(app).delete(`/api/v1/tags/${tag.body.id}`).set(auth(member.accessToken));
    expect(blocked.status).toBe(404);

    const allowed = await request(app).delete(`/api/v1/tags/${tag.body.id}`).set(auth(owner.accessToken));
    expect(allowed.status).toBe(204);
  });

  it('attaches and detaches a tag on a task, and includes it in the task detail response', async () => {
    const owner = await registerAndLogin('tag-owner7@example.com');
    const { workspace, list } = await createFolderProjectListChain(owner.accessToken);
    const tag = await createTag(owner.accessToken, workspace.id, 'Urgent');
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Slay the boss' });

    const attach = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/tags`)
      .set(auth(owner.accessToken))
      .send({ tagId: tag.body.id });
    expect(attach.status).toBe(201);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(auth(owner.accessToken));
    expect(detail.body.tags).toHaveLength(1);
    expect(detail.body.tags[0].name).toBe('Urgent');

    const detach = await request(app)
      .delete(`/api/v1/tasks/${task.body.id}/tags/${tag.body.id}`)
      .set(auth(owner.accessToken));
    expect(detach.status).toBe(204);

    const afterDetach = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(auth(owner.accessToken));
    expect(afterDetach.body.tags).toHaveLength(0);
  });

  it('rejects attaching the same tag twice', async () => {
    const owner = await registerAndLogin('tag-owner8@example.com');
    const { workspace, list } = await createFolderProjectListChain(owner.accessToken);
    const tag = await createTag(owner.accessToken, workspace.id, 'Urgent');
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Slay the boss' });

    await request(app).post(`/api/v1/tasks/${task.body.id}/tags`).set(auth(owner.accessToken)).send({ tagId: tag.body.id });
    const dupe = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/tags`)
      .set(auth(owner.accessToken))
      .send({ tagId: tag.body.id });
    expect(dupe.status).toBe(409);
  });

  it('rejects detaching a tag that was never attached', async () => {
    const owner = await registerAndLogin('tag-owner9@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Slay the boss' });

    const res = await request(app)
      .delete(`/api/v1/tasks/${task.body.id}/tags/00000000-0000-0000-0000-000000000000`)
      .set(auth(owner.accessToken));
    expect(res.status).toBe(404);
  });

  it("rejects attaching a tag that belongs to a different workspace", async () => {
    const ownerA = await registerAndLogin('tag-ownerA10@example.com');
    const ownerB = await registerAndLogin('tag-ownerB10@example.com');
    const { list } = await createFolderProjectListChain(ownerA.accessToken);
    const { workspace: workspaceB } = await createFolderProjectListChain(ownerB.accessToken);
    const foreignTag = await createTag(ownerB.accessToken, workspaceB.id, 'Foreign');

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(ownerA.accessToken))
      .send({ title: 'Slay the boss' });

    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/tags`)
      .set(auth(ownerA.accessToken))
      .send({ tagId: foreignTag.body.id });
    expect(res.status).toBe(400);
  });

  it('includes tags on the by-list and project-tasks summary endpoints', async () => {
    const owner = await registerAndLogin('tag-owner11@example.com');
    const { workspace, project, list } = await createFolderProjectListChain(owner.accessToken);
    const tag = await createTag(owner.accessToken, workspace.id, 'Urgent');
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Slay the boss' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/tags`).set(auth(owner.accessToken)).send({ tagId: tag.body.id });

    const byList = await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(auth(owner.accessToken));
    const byListTask = byList.body.find((t: { id: string }) => t.id === task.body.id);
    expect(byListTask.tags).toHaveLength(1);
    expect(byListTask.tags[0].name).toBe('Urgent');

    const projectTasks = await request(app).get(`/api/v1/projects/${project.id}/tasks`).set(auth(owner.accessToken));
    const projectTask = projectTasks.body.find((t: { id: string }) => t.id === task.body.id);
    expect(projectTask.tags).toHaveLength(1);
  });
});
