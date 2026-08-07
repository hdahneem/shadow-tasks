import { describe, it, expect } from 'vitest';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';
import { env } from '../src/lib/env.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('attachments', () => {
  it('uploads an allowed file type and returns its metadata', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Attach here' });

    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .set(h)
      .attach('file', Buffer.from('fake png bytes'), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ filename: 'photo.png', mimeType: 'image/png', taskId: task.body.id });
    expect(res.body.url).toMatch(/^\/uploads\//);

    const filePath = path.join(env.uploadsDir, path.basename(res.body.url));
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('accepts a PDF and an Office document', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);
    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Docs' });

    const pdf = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .set(h)
      .attach('file', Buffer.from('%PDF-1.4'), { filename: 'notes.pdf', contentType: 'application/pdf' });
    expect(pdf.status).toBe(201);

    const docx = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .set(h)
      .attach('file', Buffer.from('fake docx'), {
        filename: 'plan.docx',
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
    expect(docx.status).toBe(201);
  });

  it('rejects an SVG upload (stored-XSS risk) with a clean 400', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);
    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'No SVGs' });

    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .set(h)
      .attach('file', Buffer.from('<svg onload="alert(1)"></svg>'), {
        filename: 'evil.svg',
        contentType: 'image/svg+xml',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);

    const remaining = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(remaining.body.attachments).toHaveLength(0);
  });

  it('rejects an executable file type with a clean 400', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);
    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'No exes' });

    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .set(h)
      .attach('file', Buffer.from('MZ...'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed/i);
  });

  it('rejects an upload from a non-member of the workspace', async () => {
    const owner = await registerAndLogin('owner-att@example.com');
    const outsider = await registerAndLogin('outsider-att@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(auth(owner.accessToken))
      .send({ title: 'Private' });

    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .set(auth(outsider.accessToken))
      .attach('file', Buffer.from('data'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
  });

  it('deletes an attachment, removing both the DB row and the file on disk', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);
    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Delete me' });

    const uploaded = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .set(h)
      .attach('file', Buffer.from('data'), { filename: 'a.png', contentType: 'image/png' });
    const filePath = path.join(env.uploadsDir, path.basename(uploaded.body.url));
    expect(fs.existsSync(filePath)).toBe(true);

    const del = await request(app).delete(`/api/v1/attachments/${uploaded.body.id}`).set(h);
    expect(del.status).toBe(204);

    const remaining = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(remaining.body.attachments).toHaveLength(0);

    // unlink is fire-and-forget, so give it a tick to land
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it("rejects deleting another workspace member's attachment they don't have access to", async () => {
    const owner = await registerAndLogin('owner-att2@example.com');
    const outsider = await registerAndLogin('outsider-att2@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Mine' });

    const uploaded = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/attachments`)
      .set(ownerAuth)
      .attach('file', Buffer.from('data'), { filename: 'a.png', contentType: 'image/png' });

    const del = await request(app)
      .delete(`/api/v1/attachments/${uploaded.body.id}`)
      .set(auth(outsider.accessToken));
    expect(del.status).toBe(404);
  });
});
