import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, getDefaultWorkspace } from './helpers.js';

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

describe('docs', () => {
  it('creates a doc and lists it as a summary (no content) for the workspace', async () => {
    const { accessToken } = await registerAndLogin();
    const workspace = await getDefaultWorkspace(accessToken);
    const h = auth(accessToken);

    const created = await request(app)
      .post('/api/v1/docs')
      .set(h)
      .send({ workspaceId: workspace.id, title: 'Raid Plan' });
    expect(created.status).toBe(201);
    expect(created.body.content).toBe('');
    expect(created.body.title).toBe('Raid Plan');
    expect(created.body.authorName).toBeTruthy();

    const listing = await request(app).get(`/api/v1/docs?workspaceId=${workspace.id}`).set(h);
    expect(listing.status).toBe(200);
    expect(listing.body).toHaveLength(1);
    expect(listing.body[0].id).toBe(created.body.id);
    expect(listing.body[0].content).toBeUndefined();
  });

  it('rejects listing without a workspaceId', async () => {
    const { accessToken } = await registerAndLogin();
    const res = await request(app).get('/api/v1/docs').set(auth(accessToken));
    expect(res.status).toBe(400);
  });

  it('fetches the full doc including content', async () => {
    const { accessToken } = await registerAndLogin();
    const workspace = await getDefaultWorkspace(accessToken);
    const h = auth(accessToken);

    const created = await request(app).post('/api/v1/docs').set(h).send({ workspaceId: workspace.id, title: 'Notes' });
    await request(app).patch(`/api/v1/docs/${created.body.id}`).set(h).send({ content: '<p>Hello</p>' });

    const fetched = await request(app).get(`/api/v1/docs/${created.body.id}`).set(h);
    expect(fetched.body.content).toBe('<p>Hello</p>');
  });

  it('updates the title and content', async () => {
    const { accessToken } = await registerAndLogin();
    const workspace = await getDefaultWorkspace(accessToken);
    const h = auth(accessToken);

    const created = await request(app).post('/api/v1/docs').set(h).send({ workspaceId: workspace.id, title: 'Draft' });
    const updated = await request(app)
      .patch(`/api/v1/docs/${created.body.id}`)
      .set(h)
      .send({ title: 'Final', content: '<p>Body</p>' });

    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe('Final');
    expect(updated.body.content).toBe('<p>Body</p>');
  });

  it('deletes a doc', async () => {
    const { accessToken } = await registerAndLogin();
    const workspace = await getDefaultWorkspace(accessToken);
    const h = auth(accessToken);

    const created = await request(app).post('/api/v1/docs').set(h).send({ workspaceId: workspace.id, title: 'Temp' });
    const deleted = await request(app).delete(`/api/v1/docs/${created.body.id}`).set(h);
    expect(deleted.status).toBe(204);

    const listing = await request(app).get(`/api/v1/docs?workspaceId=${workspace.id}`).set(h);
    expect(listing.body).toHaveLength(0);
  });

  it('lets a viewer read docs but not create, update, or delete them', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const workspace = await getDefaultWorkspace(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const viewer = await addMember(owner.accessToken, workspace.id, 'viewer@example.com', 'viewer');
    const viewerAuth = auth(viewer.accessToken);

    const created = await request(app).post('/api/v1/docs').set(ownerAuth).send({ workspaceId: workspace.id, title: 'Team Wiki' });

    const listAsViewer = await request(app).get(`/api/v1/docs?workspaceId=${workspace.id}`).set(viewerAuth);
    expect(listAsViewer.status).toBe(200);
    const getAsViewer = await request(app).get(`/api/v1/docs/${created.body.id}`).set(viewerAuth);
    expect(getAsViewer.status).toBe(200);

    const createAsViewer = await request(app)
      .post('/api/v1/docs')
      .set(viewerAuth)
      .send({ workspaceId: workspace.id, title: 'Not allowed' });
    expect(createAsViewer.status).toBe(404);

    const updateAsViewer = await request(app)
      .patch(`/api/v1/docs/${created.body.id}`)
      .set(viewerAuth)
      .send({ title: 'Hijacked' });
    expect(updateAsViewer.status).toBe(404);

    const deleteAsViewer = await request(app).delete(`/api/v1/docs/${created.body.id}`).set(viewerAuth);
    expect(deleteAsViewer.status).toBe(404);
  });

  it("rejects reading, creating, updating, or deleting docs for a workspace the user doesn't belong to", async () => {
    const owner = await registerAndLogin('owner2@example.com');
    const outsider = await registerAndLogin('outsider2@example.com');
    const workspace = await getDefaultWorkspace(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const outsiderAuth = auth(outsider.accessToken);

    const created = await request(app).post('/api/v1/docs').set(ownerAuth).send({ workspaceId: workspace.id, title: 'Private' });

    const listRes = await request(app).get(`/api/v1/docs?workspaceId=${workspace.id}`).set(outsiderAuth);
    expect(listRes.status).toBe(404);

    const createRes = await request(app)
      .post('/api/v1/docs')
      .set(outsiderAuth)
      .send({ workspaceId: workspace.id, title: 'Intrusion' });
    expect(createRes.status).toBe(404);

    const getRes = await request(app).get(`/api/v1/docs/${created.body.id}`).set(outsiderAuth);
    expect(getRes.status).toBe(404);

    const updateRes = await request(app).patch(`/api/v1/docs/${created.body.id}`).set(outsiderAuth).send({ title: 'x' });
    expect(updateRes.status).toBe(404);

    const deleteRes = await request(app).delete(`/api/v1/docs/${created.body.id}`).set(outsiderAuth);
    expect(deleteRes.status).toBe(404);
  });
});
