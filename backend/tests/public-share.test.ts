import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function addMember(ownerToken: string, workspaceId: string, email: string, role: 'viewer' | 'member' = 'member') {
  const user = await registerAndLogin(email);
  await request(app)
    .post(`/api/v1/workspaces/${workspaceId}/invites`)
    .set(auth(ownerToken))
    .send({ email, role });
  return user;
}

describe('public task sharing', () => {
  it('generates a share token and serves a scoped-down public payload with no auth header', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Clear the gate', description: '<p>Notes</p>' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/comments`).set(h).send({ body: 'Looking good' });

    const shared = await request(app).post(`/api/v1/tasks/${task.body.id}/share`).set(h);
    expect(shared.status).toBe(200);
    expect(shared.body.shareToken).toBeTruthy();

    const publicRes = await request(app).get(`/api/v1/public/tasks/${shared.body.shareToken}`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body).toMatchObject({
      title: 'Clear the gate',
      description: '<p>Notes</p>',
      projectName: 'Clear the Red Gate',
      listName: 'Preparation',
    });
    expect(publicRes.body.comments).toEqual([
      expect.objectContaining({ authorName: expect.any(String), body: 'Looking good' }),
    ]);
  });

  it('excludes custom fields, attachments, assignees, dependencies, relations, and time entries from the public payload', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Sensitive quest' });
    const shared = await request(app).post(`/api/v1/tasks/${task.body.id}/share`).set(h);

    const publicRes = await request(app).get(`/api/v1/public/tasks/${shared.body.shareToken}`);
    for (const forbiddenKey of ['customFields', 'attachments', 'assignees', 'dependsOn', 'blocks', 'relatedTasks', 'timeEntries', 'activity']) {
      expect(publicRes.body[forbiddenKey]).toBeUndefined();
    }
  });

  it('is idempotent: enabling sharing twice returns the same token', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Stable link' });
    const first = await request(app).post(`/api/v1/tasks/${task.body.id}/share`).set(h);
    const second = await request(app).post(`/api/v1/tasks/${task.body.id}/share`).set(h);

    expect(second.body.shareToken).toBe(first.body.shareToken);
  });

  it('revokes a share link so the public route stops serving it', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Revocable' });
    const shared = await request(app).post(`/api/v1/tasks/${task.body.id}/share`).set(h);

    const revoked = await request(app).delete(`/api/v1/tasks/${task.body.id}/share`).set(h);
    expect(revoked.status).toBe(204);

    const publicRes = await request(app).get(`/api/v1/public/tasks/${shared.body.shareToken}`);
    expect(publicRes.status).toBe(404);
  });

  it('404s for a bogus or never-issued token', async () => {
    const res = await request(app).get('/api/v1/public/tasks/not-a-real-token');
    expect(res.status).toBe(404);
  });

  it('404s the public link for an archived task even if the token still exists', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'To be archived' });
    const shared = await request(app).post(`/api/v1/tasks/${task.body.id}/share`).set(h);
    await request(app).post(`/api/v1/tasks/${task.body.id}/archive`).set(h);

    const publicRes = await request(app).get(`/api/v1/public/tasks/${shared.body.shareToken}`);
    expect(publicRes.status).toBe(404);
  });

  it('lets a viewer see sharing state indirectly but not enable or revoke it', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const viewer = await addMember(owner.accessToken, workspace.id, 'viewer@example.com', 'viewer');
    const viewerAuth = auth(viewer.accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Guarded' });

    const shareAsViewer = await request(app).post(`/api/v1/tasks/${task.body.id}/share`).set(viewerAuth);
    expect(shareAsViewer.status).toBe(404);

    const shared = await request(app).post(`/api/v1/tasks/${task.body.id}/share`).set(ownerAuth);
    const revokeAsViewer = await request(app).delete(`/api/v1/tasks/${task.body.id}/share`).set(viewerAuth);
    expect(revokeAsViewer.status).toBe(404);

    // still shared, since the viewer's revoke attempt was rejected
    const publicRes = await request(app).get(`/api/v1/public/tasks/${shared.body.shareToken}`);
    expect(publicRes.status).toBe(200);
  });

  it("rejects enabling or revoking sharing for a workspace the user doesn't belong to", async () => {
    const owner = await registerAndLogin('owner2@example.com');
    const outsider = await registerAndLogin('outsider2@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const outsiderAuth = auth(outsider.accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Private' });

    const shareRes = await request(app).post(`/api/v1/tasks/${task.body.id}/share`).set(outsiderAuth);
    expect(shareRes.status).toBe(404);

    const shared = await request(app).post(`/api/v1/tasks/${task.body.id}/share`).set(ownerAuth);
    const revokeRes = await request(app).delete(`/api/v1/tasks/${task.body.id}/share`).set(outsiderAuth);
    expect(revokeRes.status).toBe(404);

    const publicRes = await request(app).get(`/api/v1/public/tasks/${shared.body.shareToken}`);
    expect(publicRes.status).toBe(200); // outsider's failed revoke didn't affect it
  });
});
