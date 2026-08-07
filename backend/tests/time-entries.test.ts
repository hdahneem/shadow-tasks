import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('time tracking', () => {
  it('starts a timer and shows it as a running (unended) entry on the task', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Grind mobs' });
    const started = await request(app).post(`/api/v1/tasks/${task.body.id}/time-entries/start`).set(h);
    expect(started.status).toBe(201);
    expect(started.body.endedAt).toBeNull();

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.timeEntries).toHaveLength(1);
    expect(detail.body.timeEntries[0].endedAt).toBeNull();
    expect(detail.body.loggedMinutes).toBeGreaterThanOrEqual(0);
  });

  it('rejects starting a second timer while one is already running elsewhere', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const taskA = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest A' });
    const taskB = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Quest B' });

    await request(app).post(`/api/v1/tasks/${taskA.body.id}/time-entries/start`).set(h);
    const secondStart = await request(app).post(`/api/v1/tasks/${taskB.body.id}/time-entries/start`).set(h);

    expect(secondStart.status).toBe(409);
    expect(secondStart.body.runningTaskId).toBe(taskA.body.id);
  });

  it('stops the running timer and records elapsed minutes', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Timed quest' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/time-entries/start`).set(h);
    const stopped = await request(app).post(`/api/v1/tasks/${task.body.id}/time-entries/stop`).set(h);

    expect(stopped.status).toBe(200);
    expect(stopped.body.endedAt).not.toBeNull();

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.timeEntries[0].endedAt).not.toBeNull();
  });

  it('rejects stopping when there is no running timer on that quest', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Never started' });
    const res = await request(app).post(`/api/v1/tasks/${task.body.id}/time-entries/stop`).set(h);
    expect(res.status).toBe(404);
  });

  it('logs a manual entry and computes logged minutes exactly', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Backfilled quest' });
    const startedAt = new Date('2026-08-01T10:00:00.000Z').toISOString();
    const endedAt = new Date('2026-08-01T10:30:00.000Z').toISOString();

    const logged = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/time-entries`)
      .set(h)
      .send({ startedAt, endedAt, note: 'Farmed loot' });
    expect(logged.status).toBe(201);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.loggedMinutes).toBe(30);
    expect(detail.body.timeEntries[0].note).toBe('Farmed loot');
  });

  it('rejects a manual entry where the end time is not after the start time', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Bad entry' });
    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/time-entries`)
      .set(h)
      .send({ startedAt: '2026-08-01T10:00:00.000Z', endedAt: '2026-08-01T09:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('updates a manual entry and re-derives logged minutes', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Editable entry' });
    const logged = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/time-entries`)
      .set(h)
      .send({ startedAt: '2026-08-01T10:00:00.000Z', endedAt: '2026-08-01T10:15:00.000Z' });

    const patched = await request(app)
      .patch(`/api/v1/time-entries/${logged.body.id}`)
      .set(h)
      .send({ endedAt: '2026-08-01T11:00:00.000Z', note: 'Extended session' });
    expect(patched.status).toBe(200);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.loggedMinutes).toBe(60);
    expect(detail.body.timeEntries[0].note).toBe('Extended session');
  });

  it('rejects a patch that would put the end time before the start time', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Guard rail' });
    const logged = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/time-entries`)
      .set(h)
      .send({ startedAt: '2026-08-01T10:00:00.000Z', endedAt: '2026-08-01T10:15:00.000Z' });

    const res = await request(app)
      .patch(`/api/v1/time-entries/${logged.body.id}`)
      .set(h)
      .send({ endedAt: '2026-08-01T09:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('deletes a time entry', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Removable entry' });
    const logged = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/time-entries`)
      .set(h)
      .send({ startedAt: '2026-08-01T10:00:00.000Z', endedAt: '2026-08-01T10:15:00.000Z' });

    const deleted = await request(app).delete(`/api/v1/time-entries/${logged.body.id}`).set(h);
    expect(deleted.status).toBe(204);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.timeEntries).toHaveLength(0);
    expect(detail.body.loggedMinutes).toBe(0);
  });

  it("rejects starting, logging, patching, or deleting time entries for a workspace the actor doesn't belong to", async () => {
    const owner = await registerAndLogin('owner7@example.com');
    const outsider = await registerAndLogin('outsider7@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const outsiderAuth = auth(outsider.accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Guarded' });

    const startRes = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/time-entries/start`)
      .set(outsiderAuth);
    expect(startRes.status).toBe(404);

    const logRes = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/time-entries`)
      .set(outsiderAuth)
      .send({ startedAt: '2026-08-01T10:00:00.000Z', endedAt: '2026-08-01T10:15:00.000Z' });
    expect(logRes.status).toBe(404);

    const logged = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/time-entries`)
      .set(ownerAuth)
      .send({ startedAt: '2026-08-01T10:00:00.000Z', endedAt: '2026-08-01T10:15:00.000Z' });

    const patchRes = await request(app)
      .patch(`/api/v1/time-entries/${logged.body.id}`)
      .set(outsiderAuth)
      .send({ note: 'nope' });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app).delete(`/api/v1/time-entries/${logged.body.id}`).set(outsiderAuth);
    expect(deleteRes.status).toBe(404);
  });
});
