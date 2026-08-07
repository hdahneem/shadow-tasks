import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain, getDefaultWorkspace } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/** Registers a second user and adds them as a member of `workspaceId` (auto-accepted since they already exist). */
async function addMember(ownerToken: string, workspaceId: string, email: string) {
  const user = await registerAndLogin(email);
  await request(app)
    .post(`/api/v1/workspaces/${workspaceId}/invites`)
    .set(auth(ownerToken))
    .send({ email, role: 'member' });
  return user;
}

describe('task assignees', () => {
  it('assigns a workspace member to a task and shows them on the detail and list responses', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member@example.com');

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Clear the gate' });

    const assigned = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/assignees`)
      .set(ownerAuth)
      .send({ userId: member.user.id });
    expect(assigned.status).toBe(201);
    expect(assigned.body.id).toBe(member.user.id);
    expect(assigned.body.name).toBe(member.user.name);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(ownerAuth);
    expect(detail.body.assignees).toEqual([expect.objectContaining({ id: member.user.id })]);
    expect(detail.body.workspaceId).toBe(workspace.id);

    const listResp = await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth);
    expect(listResp.body[0].assignees).toEqual([expect.objectContaining({ id: member.user.id })]);

    const allResp = await request(app).get('/api/v1/tasks').set(ownerAuth);
    expect(allResp.body[0].assignees).toEqual([expect.objectContaining({ id: member.user.id })]);
  });

  it('rejects assigning a user who is not a member of the workspace', async () => {
    const owner = await registerAndLogin('owner2@example.com');
    const outsider = await registerAndLogin('outsider2@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Guarded quest' });
    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/assignees`)
      .set(ownerAuth)
      .send({ userId: outsider.user.id });
    expect(res.status).toBe(400);
  });

  it('rejects assigning the same person twice', async () => {
    const owner = await registerAndLogin('owner3@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member3@example.com');

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Double book' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const dup = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/assignees`)
      .set(ownerAuth)
      .send({ userId: member.user.id });
    expect(dup.status).toBe(409);
  });

  it('unassigns a member from a task', async () => {
    const owner = await registerAndLogin('owner4@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member4@example.com');

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Temp assign' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const removed = await request(app)
      .delete(`/api/v1/tasks/${task.body.id}/assignees/${member.user.id}`)
      .set(ownerAuth);
    expect(removed.status).toBe(204);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(ownerAuth);
    expect(detail.body.assignees).toHaveLength(0);
  });

  it('404s unassigning someone who was never assigned', async () => {
    const owner = await registerAndLogin('owner5@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member5@example.com');

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Never assigned' });
    const res = await request(app)
      .delete(`/api/v1/tasks/${task.body.id}/assignees/${member.user.id}`)
      .set(ownerAuth);
    expect(res.status).toBe(404);
  });

  it("rejects assigning or unassigning for a workspace the actor doesn't belong to", async () => {
    const owner = await registerAndLogin('owner6@example.com');
    const outsider = await registerAndLogin('outsider6@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member6@example.com');

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Guarded' });

    const assignRes = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/assignees`)
      .set(auth(outsider.accessToken))
      .send({ userId: member.user.id });
    expect(assignRes.status).toBe(404);

    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const unassignRes = await request(app)
      .delete(`/api/v1/tasks/${task.body.id}/assignees/${member.user.id}`)
      .set(auth(outsider.accessToken));
    expect(unassignRes.status).toBe(404);
  });
});
