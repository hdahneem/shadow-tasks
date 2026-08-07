import request from 'supertest';
import { createApp } from '../src/app.js';

export const app = createApp();

export async function registerAndLogin(email = 'hunter@example.com') {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .send({ email, password: 'password123', name: 'Sung Jin-Woo' });
  return {
    accessToken: res.body.accessToken as string,
    refreshToken: res.body.refreshToken as string,
    user: res.body.user as { id: string; email: string; name: string },
  };
}

/** Every registered user gets a personal workspace automatically; this fetches it. */
export async function getDefaultWorkspace(accessToken: string) {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const res = await request(app).get('/api/v1/workspaces').set(auth);
  return res.body[0];
}

export async function createFolderProjectListChain(accessToken: string) {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const workspace = await getDefaultWorkspace(accessToken);

  const folder = await request(app)
    .post('/api/v1/folders')
    .set(auth)
    .send({ name: 'Dungeon Raids', color: '#22d3ee', workspaceId: workspace.id });

  const project = await request(app)
    .post('/api/v1/projects')
    .set(auth)
    .send({ name: 'Clear the Red Gate', rank: 'D', folderId: folder.body.id, workspaceId: workspace.id });

  const list = await request(app)
    .post(`/api/v1/projects/${project.body.id}/lists`)
    .set(auth)
    .send({ name: 'Preparation' });

  return { workspace, folder: folder.body, project: project.body, list: list.body };
}
