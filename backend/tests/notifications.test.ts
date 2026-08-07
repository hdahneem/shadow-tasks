import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin, createFolderProjectListChain } from './helpers.js';
import { runDueSoonScheduler, extractMentionedUserIds } from '../src/services/notification.service.js';
import { prisma } from '../src/lib/prisma.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function addMember(ownerToken: string, workspaceId: string, email: string) {
  const user = await registerAndLogin(email);
  await request(app)
    .post(`/api/v1/workspaces/${workspaceId}/invites`)
    .set(auth(ownerToken))
    .send({ email, role: 'member' });
  return user;
}

describe('extractMentionedUserIds', () => {
  it('matches @FirstName tokens case-insensitively against member first names', () => {
    const members = [
      { userId: 'u1', firstName: 'Cha' },
      { userId: 'u2', firstName: 'Baek' },
    ];
    expect(extractMentionedUserIds('hey @cha can you check this? cc @Baek', members)).toEqual(
      expect.arrayContaining(['u1', 'u2'])
    );
  });

  it('returns an empty array when there are no mentions', () => {
    expect(extractMentionedUserIds('no mentions here', [{ userId: 'u1', firstName: 'Cha' }])).toEqual([]);
  });
});

describe('notifications', () => {
  it('notifies the assignee (not the actor) when assigned to a task', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member@example.com');

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Clear the gate' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const memberNotifs = await request(app).get('/api/v1/notifications').set(auth(member.accessToken));
    expect(memberNotifs.body.unreadCount).toBe(1);
    expect(memberNotifs.body.notifications[0]).toMatchObject({ type: 'assigned', taskId: task.body.id });

    const ownerNotifs = await request(app).get('/api/v1/notifications').set(ownerAuth);
    expect(ownerNotifs.body.unreadCount).toBe(0);
  });

  it('does not notify yourself when you assign yourself', async () => {
    const { accessToken, user } = await registerAndLogin();
    const { list } = await createFolderProjectListChain(accessToken);
    const h = auth(accessToken);

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(h).send({ title: 'Solo quest' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(h).send({ userId: user.id });

    const notifs = await request(app).get('/api/v1/notifications').set(h);
    expect(notifs.body.unreadCount).toBe(0);
  });

  it('notifies current assignees (not the commenter) when a comment is added', async () => {
    const owner = await registerAndLogin('owner2@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member2@example.com');

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Discuss loot' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    await request(app).post(`/api/v1/tasks/${task.body.id}/comments`).set(ownerAuth).send({ body: 'Any updates?' });

    const memberNotifs = await request(app).get('/api/v1/notifications').set(auth(member.accessToken));
    const commentNotif = memberNotifs.body.notifications.find((n: { type: string }) => n.type === 'comment_added');
    expect(commentNotif).toBeTruthy();

    const ownerNotifs = await request(app).get('/api/v1/notifications').set(ownerAuth);
    expect(ownerNotifs.body.notifications.find((n: { type: string }) => n.type === 'comment_added')).toBeUndefined();
  });

  it('notifies an @mentioned member even if they are not assigned, without double-notifying them for the same comment', async () => {
    const owner = await registerAndLogin('owner3@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member3@example.com');
    const firstName = member.user.name.split(' ')[0];

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Needs input' });
    await request(app)
      .post(`/api/v1/tasks/${task.body.id}/comments`)
      .set(ownerAuth)
      .send({ body: `@${firstName} can you take a look?` });

    const memberNotifs = await request(app).get('/api/v1/notifications').set(auth(member.accessToken));
    expect(memberNotifs.body.unreadCount).toBe(1);
    expect(memberNotifs.body.notifications[0].type).toBe('mentioned');
  });

  it('marks a single notification as read', async () => {
    const owner = await registerAndLogin('owner4@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member4@example.com');

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Read me' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const memberAuth = auth(member.accessToken);
    const before = await request(app).get('/api/v1/notifications').set(memberAuth);
    const notifId = before.body.notifications[0].id;

    const marked = await request(app).post(`/api/v1/notifications/${notifId}/read`).set(memberAuth);
    expect(marked.status).toBe(200);

    const after = await request(app).get('/api/v1/notifications').set(memberAuth);
    expect(after.body.unreadCount).toBe(0);
  });

  it("rejects marking another user's notification as read", async () => {
    const owner = await registerAndLogin('owner5@example.com');
    const outsider = await registerAndLogin('outsider5@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member5@example.com');

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Private' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const memberNotifs = await request(app).get('/api/v1/notifications').set(auth(member.accessToken));
    const notifId = memberNotifs.body.notifications[0].id;

    const res = await request(app).post(`/api/v1/notifications/${notifId}/read`).set(auth(outsider.accessToken));
    expect(res.status).toBe(404);
  });

  it('marks all notifications as read', async () => {
    const owner = await registerAndLogin('owner6@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member6@example.com');

    const taskA = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'A' });
    const taskB = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'B' });
    await request(app).post(`/api/v1/tasks/${taskA.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });
    await request(app).post(`/api/v1/tasks/${taskB.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const memberAuth = auth(member.accessToken);
    const before = await request(app).get('/api/v1/notifications').set(memberAuth);
    expect(before.body.unreadCount).toBe(2);

    const readAll = await request(app).post('/api/v1/notifications/read-all').set(memberAuth);
    expect(readAll.status).toBe(204);

    const after = await request(app).get('/api/v1/notifications').set(memberAuth);
    expect(after.body.unreadCount).toBe(0);
  });

  it('the due-soon scheduler notifies assignees of tasks due within the window exactly once', async () => {
    const owner = await registerAndLogin('owner7@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member7@example.com');

    const dueDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour from now
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(ownerAuth)
      .send({ title: 'Due soon', dueDate });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const spawned = await runDueSoonScheduler();
    expect(spawned).toBeGreaterThanOrEqual(1);

    const memberNotifs = await request(app).get('/api/v1/notifications').set(auth(member.accessToken));
    expect(memberNotifs.body.notifications.some((n: { type: string; taskId: string }) => n.type === 'due_soon' && n.taskId === task.body.id)).toBe(true);

    const before = memberNotifs.body.unreadCount;
    await runDueSoonScheduler();
    const after = await request(app).get('/api/v1/notifications').set(auth(member.accessToken));
    expect(after.body.unreadCount).toBe(before); // no duplicate on a second tick
  });

  it('re-flags a task for due-soon notification after its due date changes', async () => {
    const owner = await registerAndLogin('owner8@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member8@example.com');

    const dueDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const task = await request(app)
      .post(`/api/v1/tasks/by-list/${list.id}`)
      .set(ownerAuth)
      .send({ title: 'Reschedule me', dueDate });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    await runDueSoonScheduler();
    const flagged = await prisma.task.findUnique({ where: { id: task.body.id } });
    expect(flagged?.dueSoonNotifiedAt).not.toBeNull();

    const newDueDate = new Date(Date.now() + 90 * 60 * 1000).toISOString();
    await request(app).patch(`/api/v1/tasks/${task.body.id}`).set(ownerAuth).send({ dueDate: newDueDate });

    const cleared = await prisma.task.findUnique({ where: { id: task.body.id } });
    expect(cleared?.dueSoonNotifiedAt).toBeNull();
  });

  it('deletes a single notification and leaves the rest untouched', async () => {
    const owner = await registerAndLogin('owner9@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member9@example.com');

    const taskA = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'A' });
    const taskB = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'B' });
    await request(app).post(`/api/v1/tasks/${taskA.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });
    await request(app).post(`/api/v1/tasks/${taskB.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const memberAuth = auth(member.accessToken);
    const before = await request(app).get('/api/v1/notifications').set(memberAuth);
    expect(before.body.notifications).toHaveLength(2);
    const [toDismiss, toKeep] = before.body.notifications;

    const dismissed = await request(app).delete(`/api/v1/notifications/${toDismiss.id}`).set(memberAuth);
    expect(dismissed.status).toBe(204);

    const after = await request(app).get('/api/v1/notifications').set(memberAuth);
    expect(after.body.notifications.map((n: { id: string }) => n.id)).toEqual([toKeep.id]);
  });

  it("rejects dismissing another user's notification", async () => {
    const owner = await registerAndLogin('owner10@example.com');
    const outsider = await registerAndLogin('outsider10@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member10@example.com');

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Private' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const memberNotifs = await request(app).get('/api/v1/notifications').set(auth(member.accessToken));
    const notifId = memberNotifs.body.notifications[0].id;

    const res = await request(app).delete(`/api/v1/notifications/${notifId}`).set(auth(outsider.accessToken));
    expect(res.status).toBe(404);

    const stillThere = await request(app).get('/api/v1/notifications').set(auth(member.accessToken));
    expect(stillThere.body.notifications).toHaveLength(1);
  });
});

describe('notification preferences', () => {
  it('defaults every type to unmuted', async () => {
    const { accessToken } = await registerAndLogin('prefs1@example.com');
    const res = await request(app).get('/api/v1/notifications/preferences').set(auth(accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual(
      expect.arrayContaining([
        { type: 'assigned', muted: false },
        { type: 'comment_added', muted: false },
        { type: 'mentioned', muted: false },
        { type: 'due_soon', muted: false },
      ])
    );
  });

  it('mutes and unmutes a type, reflected back in the preferences list', async () => {
    const { accessToken } = await registerAndLogin('prefs2@example.com');
    const h = auth(accessToken);

    const muted = await request(app).put('/api/v1/notifications/preferences/assigned').set(h).send({ muted: true });
    expect(muted.status).toBe(200);
    expect(muted.body).toEqual({ type: 'assigned', muted: true });

    const list = await request(app).get('/api/v1/notifications/preferences').set(h);
    expect(list.body).toEqual(
      expect.arrayContaining([{ type: 'assigned', muted: true }, { type: 'comment_added', muted: false }])
    );

    const unmuted = await request(app).put('/api/v1/notifications/preferences/assigned').set(h).send({ muted: false });
    expect(unmuted.body).toEqual({ type: 'assigned', muted: false });

    const listAfter = await request(app).get('/api/v1/notifications/preferences').set(h);
    expect(listAfter.body).toEqual(expect.arrayContaining([{ type: 'assigned', muted: false }]));
  });

  it('rejects setting a preference for an invalid type', async () => {
    const { accessToken } = await registerAndLogin('prefs3@example.com');
    const res = await request(app)
      .put('/api/v1/notifications/preferences/not_a_real_type')
      .set(auth(accessToken))
      .send({ muted: true });
    expect(res.status).toBe(400);
  });

  it('a muted type stops new notifications from being created, without affecting other types', async () => {
    const owner = await registerAndLogin('owner11@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const member = await addMember(owner.accessToken, workspace.id, 'member11@example.com');
    const memberAuth = auth(member.accessToken);

    await request(app).put('/api/v1/notifications/preferences/assigned').set(memberAuth).send({ muted: true });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Quiet quest' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: member.user.id });

    const afterAssign = await request(app).get('/api/v1/notifications').set(memberAuth);
    expect(afterAssign.body.unreadCount).toBe(0);

    // comment_added is untouched by muting assigned
    await request(app).post(`/api/v1/tasks/${task.body.id}/comments`).set(ownerAuth).send({ body: 'Any updates?' });
    const afterComment = await request(app).get('/api/v1/notifications').set(memberAuth);
    expect(afterComment.body.notifications.some((n: { type: string }) => n.type === 'comment_added')).toBe(true);
  });

  it('is scoped per user — muting for one member does not affect another', async () => {
    const owner = await registerAndLogin('owner12@example.com');
    const { list, workspace } = await createFolderProjectListChain(owner.accessToken);
    const ownerAuth = auth(owner.accessToken);
    const memberA = await addMember(owner.accessToken, workspace.id, 'memberA12@example.com');
    const memberB = await addMember(owner.accessToken, workspace.id, 'memberB12@example.com');

    await request(app)
      .put('/api/v1/notifications/preferences/assigned')
      .set(auth(memberA.accessToken))
      .send({ muted: true });

    const task = await request(app).post(`/api/v1/tasks/by-list/${list.id}`).set(ownerAuth).send({ title: 'Shared' });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: memberA.user.id });
    await request(app).post(`/api/v1/tasks/${task.body.id}/assignees`).set(ownerAuth).send({ userId: memberB.user.id });

    const notifsA = await request(app).get('/api/v1/notifications').set(auth(memberA.accessToken));
    expect(notifsA.body.unreadCount).toBe(0);

    const notifsB = await request(app).get('/api/v1/notifications').set(auth(memberB.accessToken));
    expect(notifsB.body.unreadCount).toBe(1);
  });
});
