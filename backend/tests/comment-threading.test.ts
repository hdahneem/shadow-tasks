import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain, getDefaultWorkspace } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('comment threading', () => {
  it('creates a reply with the correct parentCommentId', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest' });
    const parent = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(h)
      .send({ body: 'Top-level comment' });

    const reply = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(h)
      .send({ body: 'A reply', parentCommentId: parent.body.id });

    expect(reply.status).toBe(201);
    expect(reply.body.parentCommentId).toBe(parent.body.id);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.comments).toHaveLength(2);
    expect(detail.body.comments.find((c: { id: string }) => c.id === parent.body.id).parentCommentId).toBeNull();
  });

  it('rejects replying to a comment on a different task', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const taskA = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest A' });
    const taskB = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest B' });
    const commentOnA = await request(app)
      .post(`/api/v1/tasks/${taskA.body.id}/comments`)
      .set(h)
      .send({ body: 'On A' });

    const res = await request(app)
      .post(`/api/v1/tasks/${taskB.body.id}/comments`)
      .set(h)
      .send({ body: 'Trying to reply cross-task', parentCommentId: commentOnA.body.id });

    expect(res.status).toBe(404);
  });

  it('rejects replying to a reply (single-level nesting only)', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest' });
    const parent = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(h)
      .send({ body: 'Top-level' });
    const reply = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(h)
      .send({ body: 'A reply', parentCommentId: parent.body.id });

    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(h)
      .send({ body: 'Reply to a reply', parentCommentId: reply.body.id });

    expect(res.status).toBe(400);
  });

  it("notifies the parent comment's author when someone replies", async () => {
    const owner = await registerAndLogin('threadowner@example.com');
    const replier = await registerAndLogin('threadreplier@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const workspace = await getDefaultWorkspace(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'threadreplier@example.com', role: 'member' });

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Quest' });
    const parent = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(auth(owner.accessToken))
      .send({ body: 'Top-level from owner' });

    await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(auth(replier.accessToken))
      .send({ body: 'A reply from someone else', parentCommentId: parent.body.id });

    const notifications = await request(app).get('/api/v1/notifications').set(auth(owner.accessToken));
    expect(
      notifications.body.notifications.some(
        (n: { type: string; taskId: string }) => n.type === 'comment_added' && n.taskId === task.body.id
      )
    ).toBe(true);
  });

  it('cascades reply deletion when the parent comment is deleted', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest' });
    const parent = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(h)
      .send({ body: 'Top-level' });
    await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(h)
      .send({ body: 'A reply', parentCommentId: parent.body.id });

    await request(app).delete(`/api/v1/comments/${parent.body.id}`).set(h);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.comments).toHaveLength(0);
  });
});
