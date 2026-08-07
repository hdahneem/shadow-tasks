import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './helpers.js';

describe('auth', () => {
  it('registers a new user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('hunter@example.com');
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
  });

  it('rejects registering the same email twice', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    expect(res.status).toBe(409);
  });

  it('rejects a short password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'short', name: 'Sung Jin-Woo' });

    expect(res.status).toBe(400);
  });

  it('logs in with correct credentials and rejects wrong ones', async () => {
    await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    const good = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'hunter@example.com', password: 'password123' });
    expect(good.status).toBe(200);
    expect(good.body.accessToken).toBeTruthy();

    const bad = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'hunter@example.com', password: 'wrong-password' });
    expect(bad.status).toBe(401);
  });

  it('rejects requests to protected routes without a token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid access token', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.email).toBe('hunter@example.com');
  });

  it('rotates the refresh token and issues a new access token', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: reg.body.refreshToken });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.refreshToken).not.toBe(reg.body.refreshToken);

    // old refresh token is now revoked and cannot be reused
    const reused = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: reg.body.refreshToken });
    expect(reused.status).toBe(401);
  });

  it('revokes a refresh token on logout', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    await request(app).post('/api/v1/auth/logout').send({ refreshToken: reg.body.refreshToken });

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: reg.body.refreshToken });
    expect(refreshed.status).toBe(401);
  });

  it('updates the display name', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ name: 'Shadow Monarch' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Shadow Monarch');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);
    expect(me.body.name).toBe('Shadow Monarch');
  });

  it('rejects an empty display name', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    const res = await request(app)
      .patch('/api/v1/auth/me')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ name: '' });

    expect(res.status).toBe(400);
  });

  it('rejects updating the display name without a token', async () => {
    const res = await request(app).patch('/api/v1/auth/me').send({ name: 'Shadow Monarch' });
    expect(res.status).toBe(401);
  });

  it('changes the password and allows logging in with the new one', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ currentPassword: 'password123', newPassword: 'new-password456' });

    expect(res.status).toBe(204);

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'hunter@example.com', password: 'password123' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'hunter@example.com', password: 'new-password456' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects changing the password with the wrong current password', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ currentPassword: 'wrong-password', newPassword: 'new-password456' });

    expect(res.status).toBe(401);
  });

  it('rejects a new password that is too short', async () => {
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'hunter@example.com', password: 'password123', name: 'Sung Jin-Woo' });

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ currentPassword: 'password123', newPassword: 'short' });

    expect(res.status).toBe(400);
  });
});
