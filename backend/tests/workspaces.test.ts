import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain, getDefaultWorkspace } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('workspace provisioning', () => {
  it('gives every new user a personal workspace where they are owner', async () => {
    const { accessToken } = await registerAndLogin();
    const workspace = await getDefaultWorkspace(accessToken);

    expect(workspace.role).toBe('owner');

    const members = await request(app).get(`/api/v1/workspaces/${workspace.id}/members`).set(auth(accessToken));
    expect(members.body).toHaveLength(1);
    expect(members.body[0].role).toBe('owner');
  });

  it('creates additional workspaces on request, creator becomes owner', async () => {
    const { accessToken } = await registerAndLogin();
    const created = await request(app)
      .post('/api/v1/workspaces')
      .set(auth(accessToken))
      .send({ name: 'Guild Hall' });

    expect(created.status).toBe(201);
    expect(created.body.role).toBe('owner');

    const list = await request(app).get('/api/v1/workspaces').set(auth(accessToken));
    expect(list.body).toHaveLength(2);
  });
});

describe('invites', () => {
  it('immediately adds an already-registered user as a member', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const member = await registerAndLogin('member@example.com');
    const workspace = await getDefaultWorkspace(owner.accessToken);

    const invite = await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'member@example.com', role: 'member' });

    expect(invite.status).toBe(201);
    expect(invite.body.autoAccepted).toBe(true);

    const memberWorkspaces = await request(app).get('/api/v1/workspaces').set(auth(member.accessToken));
    expect(memberWorkspaces.body.some((w: { id: string; role: string }) => w.id === workspace.id && w.role === 'member')).toBe(
      true
    );
  });

  it('creates a pending invite for an unregistered email and auto-accepts it on registration', async () => {
    const owner = await registerAndLogin('owner2@example.com');
    const workspace = await getDefaultWorkspace(owner.accessToken);

    const invite = await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'newbie@example.com', role: 'viewer' });
    expect(invite.body.autoAccepted).toBe(false);

    const pending = await request(app).get(`/api/v1/workspaces/${workspace.id}/invites`).set(auth(owner.accessToken));
    expect(pending.body).toHaveLength(1);

    const newbie = await registerAndLogin('newbie@example.com');
    const newbieWorkspaces = await request(app).get('/api/v1/workspaces').set(auth(newbie.accessToken));
    expect(
      newbieWorkspaces.body.some((w: { id: string; role: string }) => w.id === workspace.id && w.role === 'viewer')
    ).toBe(true);

    const pendingAfter = await request(app)
      .get(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken));
    expect(pendingAfter.body).toHaveLength(0);
  });

  it('lets an admin revoke a pending invite', async () => {
    const owner = await registerAndLogin('owner3@example.com');
    const workspace = await getDefaultWorkspace(owner.accessToken);

    const invite = await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'ghost@example.com' });

    const revoked = await request(app)
      .delete(`/api/v1/workspaces/${workspace.id}/invites/${invite.body.id}`)
      .set(auth(owner.accessToken));
    expect(revoked.status).toBe(204);

    const pending = await request(app).get(`/api/v1/workspaces/${workspace.id}/invites`).set(auth(owner.accessToken));
    expect(pending.body).toHaveLength(0);
  });

  it('rejects invites from a non-admin member', async () => {
    const owner = await registerAndLogin('owner4@example.com');
    const viewer = await registerAndLogin('viewer4@example.com');
    const workspace = await getDefaultWorkspace(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'viewer4@example.com', role: 'viewer' });

    const res = await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(viewer.accessToken))
      .send({ email: 'someone-else@example.com' });
    expect(res.status).toBe(403);
  });
});

describe('member role management', () => {
  it('lets an admin promote and demote a member, but blocks demoting the last owner', async () => {
    const owner = await registerAndLogin('owner5@example.com');
    const other = await registerAndLogin('other5@example.com');
    const workspace = await getDefaultWorkspace(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'other5@example.com', role: 'member' });

    const promote = await request(app)
      .patch(`/api/v1/workspaces/${workspace.id}/members/${other.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'admin' });
    expect(promote.status).toBe(200);
    expect(promote.body.role).toBe('admin');

    const demoteLastOwner = await request(app)
      .patch(`/api/v1/workspaces/${workspace.id}/members/${owner.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'admin' });
    expect(demoteLastOwner.status).toBe(400);
  });

  it('only an owner can grant or revoke ownership', async () => {
    const owner = await registerAndLogin('owner6@example.com');
    const admin = await registerAndLogin('admin6@example.com');
    const workspace = await getDefaultWorkspace(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'admin6@example.com', role: 'admin' });

    const selfPromote = await request(app)
      .patch(`/api/v1/workspaces/${workspace.id}/members/${admin.user.id}`)
      .set(auth(admin.accessToken))
      .send({ role: 'owner' });
    expect(selfPromote.status).toBe(403);

    const ownerGrants = await request(app)
      .patch(`/api/v1/workspaces/${workspace.id}/members/${admin.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'owner' });
    expect(ownerGrants.status).toBe(200);
  });

  it('lets a member remove themselves, and blocks removing the last owner', async () => {
    const owner = await registerAndLogin('owner7@example.com');
    const member = await registerAndLogin('member7@example.com');
    const workspace = await getDefaultWorkspace(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'member7@example.com', role: 'member' });

    const selfLeave = await request(app)
      .delete(`/api/v1/workspaces/${workspace.id}/members/${member.user.id}`)
      .set(auth(member.accessToken));
    expect(selfLeave.status).toBe(204);

    const removeLastOwner = await request(app)
      .delete(`/api/v1/workspaces/${workspace.id}/members/${owner.user.id}`)
      .set(auth(owner.accessToken));
    expect(removeLastOwner.status).toBe(400);
  });
});

describe('role-gated access to workspace resources', () => {
  it('blocks a viewer from creating projects, folders, or tasks but allows reading', async () => {
    const owner = await registerAndLogin('owner8@example.com');
    const viewer = await registerAndLogin('viewer8@example.com');
    const { workspace, project, list } = await createFolderProjectListChain(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'viewer8@example.com', role: 'viewer' });

    const viewerAuth = auth(viewer.accessToken);

    const readProject = await request(app).get(`/api/v1/projects/${project.id}/lists`).set(viewerAuth);
    expect(readProject.status).toBe(200);

    const createFolder = await request(app)
      .post('/api/v1/folders')
      .set(viewerAuth)
      .send({ name: 'Nope', color: '#fff', workspaceId: workspace.id });
    expect(createFolder.status).toBe(403);

    const createProject = await request(app)
      .post('/api/v1/projects')
      .set(viewerAuth)
      .send({ name: 'Nope', workspaceId: workspace.id });
    expect(createProject.status).toBe(403);

    const createTask = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(viewerAuth)
      .send({ title: 'Nope' });
    expect(createTask.status).toBe(404);
  });

  it('lets a member create and manage tasks but not create/delete projects', async () => {
    const owner = await registerAndLogin('owner9@example.com');
    const member = await registerAndLogin('member9@example.com');
    const { workspace, project, list } = await createFolderProjectListChain(owner.accessToken);

    await request(app)
      .post(`/api/v1/workspaces/${workspace.id}/invites`)
      .set(auth(owner.accessToken))
      .send({ email: 'member9@example.com', role: 'member' });

    const memberAuth = auth(member.accessToken);

    const createTask = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(memberAuth)
      .send({ title: 'Scout the gate' });
    expect(createTask.status).toBe(201);

    const deleteProject = await request(app).delete(`/api/v1/projects/${project.id}`).set(memberAuth);
    expect(deleteProject.status).toBe(403);
  });

  it("returns 404 for a workspace's resources to someone outside the workspace", async () => {
    const owner = await registerAndLogin('owner10@example.com');
    const outsider = await registerAndLogin('outsider10@example.com');
    const { project, list } = await createFolderProjectListChain(owner.accessToken);

    const outsiderAuth = auth(outsider.accessToken);

    expect((await request(app).get(`/api/v1/projects/${project.id}/lists`).set(outsiderAuth)).status).toBe(404);
    expect((await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(outsiderAuth)).status).toBe(404);
    expect(
      (
        await request(app)
          .post(`/api/v1/tasks/by-list/${list.id}`)
          .set(outsiderAuth)
          .send({ title: 'Should not work' })
      ).status
    ).toBe(404);
  });
});
