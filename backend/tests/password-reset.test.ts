import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const { sendPasswordResetEmail } = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../src/lib/mailer.js', () => ({ sendPasswordResetEmail }));

import { app, registerAndLogin } from './helpers.js';
import { prisma } from '../src/lib/prisma.js';

function extractToken() {
  const url = sendPasswordResetEmail.mock.calls[0][1] as string;
  return new URL(url).searchParams.get('token')!;
}

describe('forgot/reset password', () => {
  beforeEach(() => {
    sendPasswordResetEmail.mockClear();
  });

  it('emails a reset link when the account exists', async () => {
    await registerAndLogin('reset1@example.com');

    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'reset1@example.com' });
    expect(res.status).toBe(204);
    expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(sendPasswordResetEmail).toHaveBeenCalledWith(
      'reset1@example.com',
      expect.stringContaining('/reset-password?token=')
    );
  });

  it('responds identically for an unregistered email, without sending anything', async () => {
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(204);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('resets the password with a valid token and the new password logs in', async () => {
    await registerAndLogin('reset2@example.com');
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'reset2@example.com' });
    const token = extractToken();

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'newpassword456' });
    expect(reset.status).toBe(204);

    const loginNew = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset2@example.com', password: 'newpassword456' });
    expect(loginNew.status).toBe(200);

    const loginOld = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset2@example.com', password: 'password123' });
    expect(loginOld.status).toBe(401);
  });

  it('rejects a second use of the same token', async () => {
    await registerAndLogin('reset3@example.com');
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'reset3@example.com' });
    const token = extractToken();

    const first = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'newpassword456' });
    expect(first.status).toBe(204);

    const second = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'anotherpassword789' });
    expect(second.status).toBe(400);
  });

  it('rejects an unknown token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'newpassword456' });
    expect(res.status).toBe(400);
  });

  it('rejects an expired token', async () => {
    const { user } = await registerAndLogin('reset4@example.com');
    await prisma.passwordResetToken.create({
      data: { token: 'expired-token-abc', userId: user.id, expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'expired-token-abc', newPassword: 'newpassword456' });
    expect(res.status).toBe(400);
  });

  it('revokes every existing session when the password is reset', async () => {
    const { refreshToken } = await registerAndLogin('reset5@example.com');
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'reset5@example.com' });
    const token = extractToken();
    await request(app).post('/api/v1/auth/reset-password').send({ token, newPassword: 'newpassword456' });

    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken });
    expect(refresh.status).toBe(401);
  });
});
