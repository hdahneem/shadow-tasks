import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../services/auth.service.js';
import { createPersonalWorkspace, acceptPendingInvites } from '../services/workspace.service.js';
import { parseUserAgent } from '../lib/userAgent.js';
import { sendPasswordResetEmail } from '../lib/mailer.js';
import { env } from '../lib/env.js';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).max(80),
});

authRouter.post('/register', validateBody(registerSchema), async (req, res) => {
  const { email, password, name } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({ data: { email, passwordHash, name } });
  await createPersonalWorkspace(user.id, user.name);
  await acceptPendingInvites(user.id, user.email);

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = await issueRefreshToken(user.id, req.headers['user-agent']);

  res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name },
    accessToken,
    refreshToken,
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = await issueRefreshToken(user.id, req.headers['user-agent']);

  res.json({
    user: { id: user.id, email: user.email, name: user.name },
    accessToken,
    refreshToken,
  });
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

authRouter.post('/refresh', validateBody(refreshSchema), async (req, res) => {
  const { refreshToken } = req.body;
  const result = await rotateRefreshToken(refreshToken);
  if (!result) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
  const accessToken = signAccessToken({ sub: result.user.id, email: result.user.email });
  res.json({ accessToken, refreshToken: result.refreshToken });
});

authRouter.post('/logout', validateBody(refreshSchema), async (req, res) => {
  await revokeRefreshToken(req.body.refreshToken);
  res.status(204).send();
});

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, email: user.email, name: user.name });
});

const updateMeSchema = z.object({
  name: z.string().min(1).max(80),
});

authRouter.patch('/me', requireAuth, validateBody(updateMeSchema), async (req: AuthedRequest, res) => {
  const user = await prisma.user.update({
    where: { id: req.userId },
    data: { name: req.body.name },
  });
  res.json({ id: user.id, email: user.email, name: user.name });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

authRouter.post(
  '/change-password',
  requireAuth,
  validateBody(changePasswordSchema),
  async (req: AuthedRequest, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await verifyPassword(req.body.currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await hashPassword(req.body.newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.status(204).send();
  }
);

// --- Forgot/reset password (emailed one-time link) ---

const forgotPasswordSchema = z.object({ email: z.string().email() });

authRouter.post('/forgot-password', validateBody(forgotPasswordSchema), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { email: req.body.email } });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    await prisma.passwordResetToken.create({
      data: { token, userId: user.id, expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });
    const resetUrl = `${env.corsOrigin}/reset-password?token=${token}`;
    await sendPasswordResetEmail(user.email, resetUrl);
  }
  // Same response whether or not the account exists — otherwise this endpoint could be
  // used to check which emails are registered.
  res.status(204).send();
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

authRouter.post('/reset-password', validateBody(resetPasswordSchema), async (req, res) => {
  const resetToken = await prisma.passwordResetToken.findUnique({ where: { token: req.body.token } });
  if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired' });
  }

  const passwordHash = await hashPassword(req.body.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: resetToken.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: resetToken.id }, data: { usedAt: new Date() } }),
    // A password reset should end every existing session, same as a deliberate change would.
    prisma.refreshToken.updateMany({
      where: { userId: resetToken.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  res.status(204).send();
});

const deleteAccountSchema = z.object({ password: z.string().min(1) });

authRouter.delete('/me', requireAuth, validateBody(deleteAccountSchema), async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) return res.status(404).json({ error: 'User not found' });

  const valid = await verifyPassword(req.body.password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  // Deleting a user cascades to every workspace they own. If a workspace has other
  // members, that would silently destroy shared data out from under them — so those
  // must be handed off or removed first rather than disappearing as a side effect.
  const ownedWorkspaces = await prisma.workspace.findMany({
    where: { ownerId: user.id },
    include: { _count: { select: { members: true } } },
  });
  const blockingWorkspaces = ownedWorkspaces.filter((w) => w._count.members > 1);
  if (blockingWorkspaces.length > 0) {
    return res.status(409).json({
      error: `You own workspace(s) with other members. Remove the other members or delete these workspaces before deleting your account: ${blockingWorkspaces
        .map((w) => w.name)
        .join(', ')}`,
    });
  }

  // Folders/Projects/Docs the user authored *inside someone else's* workspace (as an
  // admin) also cascade-delete with them. Hand those off to the workspace owner instead
  // of letting a departing admin take shared structure down with them.
  const [foreignFolders, foreignProjects, foreignDocs] = await Promise.all([
    prisma.folder.findMany({
      where: { ownerId: user.id, workspace: { ownerId: { not: user.id } } },
      include: { workspace: true },
    }),
    prisma.project.findMany({
      where: { ownerId: user.id, workspace: { ownerId: { not: user.id } } },
      include: { workspace: true },
    }),
    prisma.doc.findMany({
      where: { authorId: user.id, workspace: { ownerId: { not: user.id } } },
      include: { workspace: true },
    }),
  ]);

  await Promise.all([
    ...foreignFolders.map((f) =>
      prisma.folder.update({ where: { id: f.id }, data: { ownerId: f.workspace.ownerId } })
    ),
    ...foreignProjects.map((p) =>
      prisma.project.update({ where: { id: p.id }, data: { ownerId: p.workspace.ownerId } })
    ),
    ...foreignDocs.map((d) =>
      prisma.doc.update({ where: { id: d.id }, data: { authorId: d.workspace.ownerId } })
    ),
  ]);

  await prisma.user.delete({ where: { id: user.id } });
  res.status(204).send();
});

// --- Active sessions (refresh tokens, one per signed-in device) ---

authRouter.get('/sessions', requireAuth, async (req: AuthedRequest, res) => {
  const currentToken = req.headers['x-refresh-token'];
  const sessions = await prisma.refreshToken.findMany({
    where: { userId: req.userId!, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });
  res.json(
    sessions.map((s) => ({
      id: s.id,
      device: parseUserAgent(s.userAgent),
      createdAt: s.createdAt,
      current: typeof currentToken === 'string' && currentToken === s.token,
    }))
  );
});

authRouter.delete('/sessions/:id', requireAuth, async (req: AuthedRequest, res) => {
  const session = await prisma.refreshToken.findFirst({
    where: { id: req.params.id, userId: req.userId!, revokedAt: null },
  });
  if (!session) return res.status(404).json({ error: 'Session not found' });

  await prisma.refreshToken.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  res.status(204).send();
});

const revokeOthersSchema = z.object({ currentRefreshToken: z.string().min(1) });

authRouter.post(
  '/sessions/revoke-others',
  requireAuth,
  validateBody(revokeOthersSchema),
  async (req: AuthedRequest, res) => {
    await prisma.refreshToken.updateMany({
      where: {
        userId: req.userId!,
        revokedAt: null,
        token: { not: req.body.currentRefreshToken },
      },
      data: { revokedAt: new Date() },
    });
    res.status(204).send();
  }
);
