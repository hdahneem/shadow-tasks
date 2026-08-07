import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain, getDefaultWorkspace } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('account deletion', () => {
  it('rejects deletion with the wrong password', async () => {
    const { accessToken } = await registerAndLogin();

    const res = await request(app)
      .delete('/api/v1/auth/me')
      .set(auth(accessToken))
      .send({ password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('deletes the account and its personal workspace when it has no other members', async () => {
    const { accessToken, user } = await registerAndLogin('solo@example.com');
    const workspace = await getDefaultWorkspace(accessToken);

    const res = await request(app)
      .delete('/api/v1/auth/me')
      .set(auth(accessToken))
      .send({ password: 'password123' });

    expect(res.status).toBe(204);

    const loginAfter = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'solo@example.com', password: 'password123' });
    expect(loginAfter.status).toBe(401);

    // the personal workspace cascaded away with the user (the JWT itself still verifies,
    // but the membership behind it is gone, so this now resolves as "not found")
    const asOwner = await request(app).get(`/api/v1/workspaces/${workspace.id}/members`).set(auth(accessToken));
    expect(asOwner.status).toBe(404);
    void user;
  });

  it('blocks deletion when the user owns a workspace with other members', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const member = await registerAndLogin('member@example.com');
    const workspace = await getDefaultWorkspace(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'member@example.com', role: 'member' });

    const res = await request(app)
      .delete('/api/v1/auth/me')
      .set(auth(owner.accessToken))
      .send({ password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain(workspace.name);

    // account must still exist and be able to log in
    const stillWorks = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'owner@example.com', password: 'password123' });
    expect(stillWorks.status).toBe(200);
  });

  it('hands off folders/projects/docs created in someone else\'s workspace to that workspace\'s owner instead of deleting them', async () => {
    const owner = await registerAndLogin('teamowner@example.com');
    const admin = await registerAndLogin('teamadmin@example.com');
    const ownerWorkspace = await getDefaultWorkspace(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${ownerWorkspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'teamadmin@example.com', role: 'admin' });

    const folder = await request(app)
      .post('/api/v1/folders')
      .set(auth(admin.accessToken))
      .send({ name: 'Admin-made Folder', color: '#f43f5e', workspaceId: ownerWorkspace.id });
    expect(folder.status).toBe(201);

    const project = await request(app)
      .post('/api/v1/projects')
      .set(auth(admin.accessToken))
      .send({ name: 'Admin-made Project', rank: 'C', folderId: folder.body.id, workspaceId: ownerWorkspace.id });
    expect(project.status).toBe(201);

    const doc = await request(app)
      .post('/api/v1/docs')
      .set(auth(admin.accessToken))
      .send({ workspaceId: ownerWorkspace.id, title: 'Admin-made Doc' });
    expect(doc.status).toBe(201);

    const del = await request(app)
      .delete('/api/v1/auth/me')
      .set(auth(admin.accessToken))
      .send({ password: 'password123' });
    expect(del.status).toBe(204);

    // the content survives, now owned by the workspace's actual owner
    const folders = await request(app).get('/api/v1/folders').set(auth(owner.accessToken));
    const survivedFolder = folders.body.find((f: { id: string }) => f.id === folder.body.id);
    expect(survivedFolder).toBeTruthy();

    const projects = await request(app).get('/api/v1/projects').set(auth(owner.accessToken));
    const survivedProject = projects.body.find((p: { id: string }) => p.id === project.body.id);
    expect(survivedProject).toBeTruthy();

    const docs = await request(app).get(`/api/v1/docs?workspaceId=${ownerWorkspace.id}`).set(auth(owner.accessToken));
    const survivedDoc = docs.body.find((d: { id: string }) => d.id === doc.body.id);
    expect(survivedDoc).toBeTruthy();
  });
});
