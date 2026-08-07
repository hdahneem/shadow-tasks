import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function addMember(ownerToken: string, workspaceId: string, email: string, role: 'viewer' | 'member' = 'viewer') {
  const user = await registerAndLogin(email);
  await request(app)
    .post(`/api/v1/workspaces/${workspaceId}/invites`)
    .set(auth(ownerToken))
    .send({ email, role });
  return user;
}

describe('workspace activity feed', () => {
  it('returns activity across multiple tasks, most recent first, with actor and task info', async () => {
    const { accessToken } = await registerAndLogin();
    const { list, workspace } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const taskA = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest A' });
    const taskB = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest B' });
    await request(app).post(`/api/v1/tasks/${taskB.body.id}/comments`).set(h).send({ body: 'Nice work' });

    const feed = await request(app).get(`/api/v1/workspaces/${workspace.id}/activity`).set(h);
    expect(feed.status).toBe(200);

    // most recent first: the comment on Quest B, then Quest B's creation, then Quest A's creation
    expect(feed.body[0]).toMatchObject({ type: 'comment_added', taskId: taskB.body.id, taskTitle: 'Quest B' });
    expect(feed.body[0].actorName).toBeTruthy();
    const taskCreatedEvents = feed.body.filter((e: { type: string }) => e.type === 'task_created');
    expect(taskCreatedEvents.map((e: { taskTitle: string }) => e.taskTitle)).toEqual(
      expect.arrayContaining(['Quest A', 'Quest B'])
    );

    const times = feed.body.map((e: { createdAt: string }) => new Date(e.createdAt).getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('respects limit and offset for pagination', async () => {
    const { accessToken } = await registerAndLogin();
    const { list, workspace } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    for (let i = 0; i < 5; i++) {
      await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: `Quest ${i}` });
    }

    const page1 = await request(app).get(`/api/v1/workspaces/${workspace.id}/activity?limit=2&offset=0`).set(h);
    const page2 = await request(app).get(`/api/v1/workspaces/${workspace.id}/activity?limit=2&offset=2`).set(h);
    expect(page1.body).toHaveLength(2);
    expect(page2.body).toHaveLength(2);
    expect(page1.body.map((e: { id: string }) => e.id)).not.toEqual(page2.body.map((e: { id: string }) => e.id));
  });

  it('lets a viewer read the activity feed', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const viewer = await addMember(owner.accessToken, workspace.id, 'viewer@example.com', 'viewer');

    await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Visible quest' });

    const feed = await request(app).get(`/api/v1/workspaces/${workspace.id}/activity`).set(auth(viewer.accessToken));
    expect(feed.status).toBe(200);
    expect(feed.body.length).toBeGreaterThan(0);
  });

  it("rejects the feed for a workspace the user doesn't belong to", async () => {
    const owner = await registerAndLogin('owner2@example.com');
    const outsider = await registerAndLogin('outsider2@example.com');
    const { workspace } = await createFolderProjectListChain(owner.accessToken);

    const res = await request(app)
      .get(`/api/v1/workspaces/${workspace.id}/activity`)
      .set(auth(outsider.accessToken));
    expect(res.status).toBe(404);
  });

  it("does not leak activity from a different workspace", async () => {
    const userA = await registerAndLogin('usera@example.com');
    const userB = await registerAndLogin('userb@example.com');
    const { list: listA, workspace: workspaceA } = await createFolderProjectListChain(userA.accessToken);
    const { list: listB } = await createFolderProjectListChain(userB.accessToken);

    await request(app).post(`/api/v1/tasks/by-list/${listA.id}`).set(auth(userA.accessToken)).send({ title: 'In A' });
    await request(app).post(`/api/v1/tasks/by-list/${listB.id}`).set(auth(userB.accessToken)).send({ title: 'In B' });

    const feed = await request(app)
      .get(`/api/v1/workspaces/${workspaceA.id}/activity`)
      .set(auth(userA.accessToken));
    expect(feed.body.every((e: { taskTitle: string }) => e.taskTitle !== 'In B')).toBe(true);
  });
});
