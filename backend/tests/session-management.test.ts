import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, registerAndLogin } from './helpers.js';

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FIREFOX_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0';

describe('session management', () => {
  it('lists the session created at login, with its device label', async () => {
    const { accessToken } = await registerAndLogin('sessions1@example.com');

    // registerAndLogin's own request didn't set a User-Agent; log in again with one to
    // get a session we can assert a specific device label for
    const login = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', CHROME_MAC)
      .send({ email: 'sessions1@example.com', password: 'password123' });

    const sessions = await request(app).get('/api/v1/auth/sessions').set(auth(accessToken));
    expect(sessions.status).toBe(200);
    expect(sessions.body.some((s: { device: string }) => s.device === 'Chrome on macOS')).toBe(true);
    void login;
  });

  it('flags the session matching the X-Refresh-Token header as current', async () => {
    const { accessToken } = await registerAndLogin('sessions2@example.com');

    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', CHROME_MAC)
      .send({ email: 'sessions2@example.com', password: 'password123' });
    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .set('User-Agent', FIREFOX_WIN)
      .send({ email: 'sessions2@example.com', password: 'password123' });

    const sessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set(auth(accessToken))
      .set('X-Refresh-Token', loginB.body.refreshToken);

    const current = sessions.body.filter((s: { current: boolean }) => s.current);
    expect(current).toHaveLength(1);
    expect(current[0].device).toBe('Firefox on Windows');
    void loginA;
  });

  it('revoking one session logs it out without affecting others', async () => {
    const { accessToken } = await registerAndLogin('sessions3@example.com');

    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'sessions3@example.com', password: 'password123' });
    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'sessions3@example.com', password: 'password123' });

    // identify loginA's session id via the X-Refresh-Token "current" flag, then revoke
    // exactly that one (there's also the register call's own session in the mix, so we
    // can't just grab an arbitrary row)
    const sessions = await request(app)
      .get('/api/v1/auth/sessions')
      .set(auth(accessToken))
      .set('X-Refresh-Token', loginA.body.refreshToken);
    const sessionA = sessions.body.find((s: { current: boolean }) => s.current);
    expect(sessionA).toBeTruthy();

    const del = await request(app).delete(`/api/v1/auth/sessions/${sessionA.id}`).set(auth(accessToken));
    expect(del.status).toBe(204);

    const refreshA = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: loginA.body.refreshToken });
    const refreshB = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: loginB.body.refreshToken });
    expect(refreshA.status).toBe(401);
    expect(refreshB.status).toBe(200);
  });

  it('revoke-others leaves only the current session active', async () => {
    const { accessToken } = await registerAndLogin('sessions4@example.com');

    const loginA = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'sessions4@example.com', password: 'password123' });
    const loginB = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'sessions4@example.com', password: 'password123' });

    const revoke = await request(app)
      .post('/api/v1/auth/sessions/revoke-others')
      .set(auth(accessToken))
      .send({ currentRefreshToken: loginB.body.refreshToken });
    expect(revoke.status).toBe(204);

    const refreshA = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: loginA.body.refreshToken });
    const refreshB = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: loginB.body.refreshToken });
    expect(refreshA.status).toBe(401);
    expect(refreshB.status).toBe(200);
  });

  it("rejects revoking another user's session", async () => {
    const userA = await registerAndLogin('sessionsA@example.com');
    const userB = await registerAndLogin('sessionsB@example.com');

    const sessionsB = await request(app).get('/api/v1/auth/sessions').set(auth(userB.accessToken));
    const targetId = sessionsB.body[0].id;

    const del = await request(app).delete(`/api/v1/auth/sessions/${targetId}`).set(auth(userA.accessToken));
    expect(del.status).toBe(404);

    // userB's session is untouched
    const stillWorks = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: userB.refreshToken });
    expect(stillWorks.status).toBe(200);
  });
});
