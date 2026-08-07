import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';
import { computeNextDueDate, runRecurrenceScheduler } from '../src/services/recurrence.service.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('computeNextDueDate', () => {
  const d = (iso: string) => new Date(iso);

  it('advances by N days for daily frequency', () => {
    const next = computeNextDueDate(d('2026-08-04T12:00:00Z'), 'daily', 3, false);
    expect(next.toISOString()).toBe('2026-08-07T12:00:00.000Z');
  });

  it('advances by N weeks for weekly frequency', () => {
    const next = computeNextDueDate(d('2026-08-04T12:00:00Z'), 'weekly', 2, false);
    expect(next.toISOString()).toBe('2026-08-18T12:00:00.000Z');
  });

  it('advances by N months for monthly frequency', () => {
    const next = computeNextDueDate(d('2026-08-04T12:00:00Z'), 'monthly', 1, false);
    expect(next.toISOString()).toBe('2026-09-04T12:00:00.000Z');
  });

  it('advances by N years for yearly frequency', () => {
    const next = computeNextDueDate(d('2026-08-04T12:00:00Z'), 'yearly', 1, false);
    expect(next.toISOString()).toBe('2027-08-04T12:00:00.000Z');
  });

  it('skips forward past Saturday/Sunday when skipWeekends is set', () => {
    // 2026-08-04 is a Tuesday; +3 days lands on Friday 2026-08-07, +4 days lands on Saturday 2026-08-08.
    const next = computeNextDueDate(d('2026-08-04T12:00:00Z'), 'daily', 4, true);
    expect(next.getUTCDay()).not.toBe(0);
    expect(next.getUTCDay()).not.toBe(6);
    expect(next.toISOString()).toBe('2026-08-10T12:00:00.000Z'); // Saturday -> Monday
  });

  it('does not shift a weekday when skipWeekends is set', () => {
    const next = computeNextDueDate(d('2026-08-04T12:00:00Z'), 'daily', 3, true); // lands Friday
    expect(next.toISOString()).toBe('2026-08-07T12:00:00.000Z');
  });
});

describe('recurring tasks API', () => {
  it('creates an after_completion recurrence rule and rejects a second one on the same task', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Water the plants' });

    const created = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(h)
      .send({ frequency: 'daily', interval: 1, mode: 'after_completion' });
    expect(created.status).toBe(201);
    expect(created.body.frequency).toBe('daily');
    expect(created.body.active).toBe(true);

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.recurrence.id).toBe(created.body.id);

    const second = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(h)
      .send({ frequency: 'weekly' });
    expect(second.status).toBe(409);
  });

  it('rejects fixed_schedule recurrence on a task with no due date', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'No due date' });
    const res = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(h)
      .send({ frequency: 'daily', mode: 'fixed_schedule' });
    expect(res.status).toBe(400);
  });

  it('spawns the next occurrence in the same list when an after_completion task is completed', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Daily standup', priority: 'high' });
    await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(h)
      .send({ frequency: 'daily', interval: 2, mode: 'after_completion' });

    const before = await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(h);
    expect(before.body).toHaveLength(1);

    await request(app).patch(`/api/v1/tasks/${task.body.id}`).set(h).send({ done: true });

    const after = await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(h);
    expect(after.body).toHaveLength(2);
    const spawned = after.body.find((t: { id: string }) => t.id !== task.body.id);
    expect(spawned.title).toBe('Daily standup');
    expect(spawned.priority).toBe('high');
    expect(spawned.done).toBe(false);
    expect(new Date(spawned.dueDate).getTime()).toBeGreaterThan(Date.now());

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.done).toBe(true);
    expect(detail.body.recurrence.occurrenceCount).toBe(2);
  });

  it('spawns the next occurrence when a task is moved to a completed workflow status', async () => {
    const { accessToken } = await registerAndLogin();
    const { list, project } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Weekly report' });
    await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(h)
      .send({ frequency: 'weekly' });

    const statuses = await request(app).get(`/api/v1/projects/${project.id}/statuses`).set(h);
    const doneStatus = statuses.body.find((s: { isCompleted: boolean }) => s.isCompleted);

    await request(app).patch(`/api/v1/tasks/${task.body.id}/status`).set(h).send({ statusId: doneStatus.id });

    const after = await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(h);
    expect(after.body).toHaveLength(2);
  });

  it('stops spawning once maxOccurrences is reached and deactivates the rule', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'One-shot repeat' });
    await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(h)
      .send({ frequency: 'daily', maxOccurrences: 1 });

    await request(app).patch(`/api/v1/tasks/${task.body.id}`).set(h).send({ done: true });

    const after = await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(h);
    expect(after.body).toHaveLength(1); // no new occurrence spawned

    const detail = await request(app).get(`/api/v1/tasks/${task.body.id}`).set(h);
    expect(detail.body.recurrence.active).toBe(false);
  });

  it('stops spawning once the computed next due date passes endDate', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Expiring repeat' });
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(h)
      .send({ frequency: 'daily', endDate: yesterday });

    await request(app).patch(`/api/v1/tasks/${task.body.id}`).set(h).send({ done: true });

    const after = await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(h);
    expect(after.body).toHaveLength(1);
  });

  it('fixed_schedule rules spawn via the scheduler tick, not on completion, and advance nextRunAt', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const dueDate = new Date(Date.now() + 60_000).toISOString();
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(h)
      .send({ title: 'Daily standup (fixed)', dueDate });
    const rule = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(h)
      .send({ frequency: 'daily', interval: 1, mode: 'fixed_schedule' });
    expect(rule.status).toBe(201);

    // Completing it should NOT spawn anything — fixed_schedule ignores completion.
    await request(app).patch(`/api/v1/tasks/${task.body.id}`).set(h).send({ done: true });
    const afterCompletion = await request(app).get(`/api/v1/tasks/by-list/${list.id}?includeDone=true`).set(h);
    expect(afterCompletion.body).toHaveLength(1);

    // Ticking the scheduler with a `now` past the rule's nextRunAt spawns the next occurrence.
    const spawnedCount = await runRecurrenceScheduler(new Date(Date.now() + 120_000));
    expect(spawnedCount).toBe(1);

    const after = await request(app).get(`/api/v1/tasks/by-list/${list.id}?includeDone=true`).set(h);
    expect(after.body).toHaveLength(2);
  });

  it('updates recurrence settings via PATCH and stops recurrence via DELETE', async () => {
    const { accessToken } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Adjustable repeat' });
    const rule = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(h)
      .send({ frequency: 'daily', interval: 1 });

    const patched = await request(app)
      .patch(`/api/v1/recurrence/${rule.body.id}`)
      .set(h)
      .send({ interval: 5, skipWeekends: true });
    expect(patched.status).toBe(200);
    expect(patched.body.interval).toBe(5);
    expect(patched.body.skipWeekends).toBe(true);

    const stopped = await request(app).delete(`/api/v1/recurrence/${rule.body.id}`).set(h);
    expect(stopped.status).toBe(204);

    await request(app).patch(`/api/v1/tasks/${task.body.id}`).set(h).send({ done: true });
    const after = await request(app).get(`/api/v1/tasks/by-list/${list.id}`).set(h);
    expect(after.body).toHaveLength(1); // stopped rule spawns nothing
  });

  it("rejects creating, updating, or stopping recurrence for a workspace the user doesn't belong to", async () => {
    const owner = await registerAndLogin('owner@example.com');
    const outsider = await registerAndLogin('outsider@example.com');
    const { list } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const outsiderAuth = auth(outsider.accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Guarded' });

    const createRes = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(outsiderAuth)
      .send({ frequency: 'daily' });
    expect(createRes.status).toBe(404);

    const rule = await request(app)
      .post(`/api/v1/tasks/${task.body.id}/recurrence`)
      .set(ownerAuth)
      .send({ frequency: 'daily' });

    const patchRes = await request(app)
      .patch(`/api/v1/recurrence/${rule.body.id}`)
      .set(outsiderAuth)
      .send({ interval: 2 });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app).delete(`/api/v1/recurrence/${rule.body.id}`).set(outsiderAuth);
    expect(deleteRes.status).toBe(404);
  });
});
