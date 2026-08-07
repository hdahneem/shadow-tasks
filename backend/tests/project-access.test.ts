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

async function projectEffectiveRole(token: string, projectId: string) {
  const res = await request(app).get('/api/v1/projects').set(auth(token));
  return res.body.find((p: { id: string }) => p.id === projectId)?.effectiveRole;
}

describe('project-level access overrides', () => {
  it('falls back to the workspace role when no override exists', async () => {
    const owner = await registerAndLogin('access-owner1@example.com');
    const { project } = await createFolderProjectListChain(owner.accessToken);
    expect(await projectEffectiveRole(owner.accessToken, project.id)).toBe('owner');
  });

  it('an override elevates access above the workspace role', async () => {
    const owner = await registerAndLogin('access-owner2@example.com');
    const member = await registerAndLogin('access-member2@example.com');
    const { workspace, project } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-member2@example.com', 'viewer');

    expect(await projectEffectiveRole(member.accessToken, project.id)).toBe('viewer');

    const set = await request(app)
      .put(`/api/v1/projects/${project.id}/members/${member.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'admin' });
    expect(set.status).toBe(200);

    expect(await projectEffectiveRole(member.accessToken, project.id)).toBe('admin');
  });

  it('an override restricts access below the workspace role', async () => {
    const owner = await registerAndLogin('access-owner3@example.com');
    const admin = await registerAndLogin('access-admin3@example.com');
    const { workspace, project } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-admin3@example.com', 'admin');

    await request(app)
      .put(`/api/v1/projects/${project.id}/members/${admin.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'viewer' });

    expect(await projectEffectiveRole(admin.accessToken, project.id)).toBe('viewer');
  });

  it('removing an override reverts to the workspace role', async () => {
    const owner = await registerAndLogin('access-owner4@example.com');
    const member = await registerAndLogin('access-member4@example.com');
    const { workspace, project } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-member4@example.com', 'member');

    await request(app)
      .put(`/api/v1/projects/${project.id}/members/${member.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'admin' });
    expect(await projectEffectiveRole(member.accessToken, project.id)).toBe('admin');

    const del = await request(app)
      .delete(`/api/v1/projects/${project.id}/members/${member.user.id}`)
      .set(auth(owner.accessToken));
    expect(del.status).toBe(204);

    expect(await projectEffectiveRole(member.accessToken, project.id)).toBe('member');
  });

  it('deleting a non-existent override is a no-op, not an error', async () => {
    const owner = await registerAndLogin('access-owner5@example.com');
    const member = await registerAndLogin('access-member5@example.com');
    const { workspace, project } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-member5@example.com', 'member');

    const del = await request(app)
      .delete(`/api/v1/projects/${project.id}/members/${member.user.id}`)
      .set(auth(owner.accessToken));
    expect(del.status).toBe(204);
  });

  it('rejects setting an override for a non-workspace-member', async () => {
    const owner = await registerAndLogin('access-owner6@example.com');
    const outsider = await registerAndLogin('access-outsider6@example.com');
    const { project } = await createFolderProjectListChain(owner.accessToken);

    const res = await request(app)
      .put(`/api/v1/projects/${project.id}/members/${outsider.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'admin' });
    expect(res.status).toBe(400);
  });

  it("rejects setting an override role of 'owner'", async () => {
    const owner = await registerAndLogin('access-owner7@example.com');
    const member = await registerAndLogin('access-member7@example.com');
    const { workspace, project } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-member7@example.com', 'member');

    const res = await request(app)
      .put(`/api/v1/projects/${project.id}/members/${member.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'owner' });
    expect(res.status).toBe(400);
  });

  it('rejects a plain workspace member setting an override (requires effective admin)', async () => {
    const owner = await registerAndLogin('access-owner8@example.com');
    const member = await registerAndLogin('access-member8@example.com');
    const other = await registerAndLogin('access-other8@example.com');
    const { workspace, project } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-member8@example.com', 'member');
    await inviteAsRole(owner.accessToken, workspace.id, 'access-other8@example.com', 'viewer');

    const res = await request(app)
      .put(`/api/v1/projects/${project.id}/members/${other.user.id}`)
      .set(auth(member.accessToken))
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('a user granted project-admin via override can delegate further overrides on that same project', async () => {
    const owner = await registerAndLogin('access-owner9@example.com');
    const delegate = await registerAndLogin('access-delegate9@example.com');
    const third = await registerAndLogin('access-third9@example.com');
    const { workspace, project } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-delegate9@example.com', 'viewer');
    await inviteAsRole(owner.accessToken, workspace.id, 'access-third9@example.com', 'viewer');

    await request(app)
      .put(`/api/v1/projects/${project.id}/members/${delegate.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'admin' });

    const res = await request(app)
      .put(`/api/v1/projects/${project.id}/members/${third.user.id}`)
      .set(auth(delegate.accessToken))
      .send({ role: 'member' });
    expect(res.status).toBe(200);
    expect(await projectEffectiveRole(third.accessToken, project.id)).toBe('member');
  });

  it('GET /projects/:id/members returns the merged workspace + override view', async () => {
    const owner = await registerAndLogin('access-owner10@example.com');
    const member = await registerAndLogin('access-member10@example.com');
    const { workspace, project } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-member10@example.com', 'member');
    await request(app)
      .put(`/api/v1/projects/${project.id}/members/${member.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'admin' });

    const res = await request(app).get(`/api/v1/projects/${project.id}/members`).set(auth(owner.accessToken));
    expect(res.status).toBe(200);
    const memberRow = res.body.find((m: { userId: string }) => m.userId === member.user.id);
    expect(memberRow).toMatchObject({ workspaceRole: 'member', overrideRole: 'admin', effectiveRole: 'admin' });
    const ownerRow = res.body.find((m: { userId: string }) => m.userId === owner.user.id);
    expect(ownerRow).toMatchObject({ workspaceRole: 'owner', overrideRole: null, effectiveRole: 'owner' });
  });

  // --- Cross-cutting proof: the override actually changes behavior on real routes, not just role resolution ---

  it('a project-level admin override lets a workspace viewer create a status on that project', async () => {
    const owner = await registerAndLogin('access-owner11@example.com');
    const viewer = await registerAndLogin('access-viewer11@example.com');
    const { workspace, project } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-viewer11@example.com', 'viewer');

    const blocked = await request(app)
      .post(`/api/v1/projects/${project.id}/statuses`)
      .set(auth(viewer.accessToken))
      .send({ name: 'Blocked' });
    expect(blocked.status).toBe(403);

    await request(app)
      .put(`/api/v1/projects/${project.id}/members/${viewer.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'admin' });

    const allowed = await request(app)
      .post(`/api/v1/projects/${project.id}/statuses`)
      .set(auth(viewer.accessToken))
      .send({ name: 'Allowed' });
    expect(allowed.status).toBe(201);
  });

  it('a project-level viewer override blocks a workspace admin from editing tasks on that project', async () => {
    const owner = await registerAndLogin('access-owner12@example.com');
    const admin = await registerAndLogin('access-admin12@example.com');
    const { workspace, project, list } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-admin12@example.com', 'admin');

    const created = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Some quest' });

    const allowed = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set(auth(admin.accessToken))
      .send({ title: 'Edited before override' });
    expect(allowed.status).toBe(200);

    await request(app)
      .put(`/api/v1/projects/${project.id}/members/${admin.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'viewer' });

    const blocked = await request(app)
      .patch(`/api/v1/tasks/${created.body.id}`)
      .set(auth(admin.accessToken))
      .send({ title: 'Edited after override' });
    // masked as 404, consistent with findOwnedTask's existing not-a-member-or-lacks-role behavior
    expect(blocked.status).toBe(404);
  });

  it('a stray override row does not grant access once removed from the workspace entirely', async () => {
    const owner = await registerAndLogin('access-owner13@example.com');
    const member = await registerAndLogin('access-member13@example.com');
    const { workspace, project } = await createFolderProjectListChain(owner.accessToken);
    await inviteAsRole(owner.accessToken, workspace.id, 'access-member13@example.com', 'member');
    await request(app)
      .put(`/api/v1/projects/${project.id}/members/${member.user.id}`)
      .set(auth(owner.accessToken))
      .send({ role: 'admin' });

    await request(app)
      .delete(`/api/v1/workspaces/${workspace.id}/members/${member.user.id}`)
      .set(auth(owner.accessToken));

    const projects = await request(app).get('/api/v1/projects').set(auth(member.accessToken));
    expect(projects.body.find((p: { id: string }) => p.id === project.id)).toBeUndefined();

    const patch = await request(app)
      .patch(`/api/v1/projects/${project.id}`)
      .set(auth(member.accessToken))
      .send({ name: 'Hijacked' });
    expect(patch.status).toBe(404);
  });
});
