import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../services/auth.service.js';

// Pinning the route-params generic to a plain string map works around
// @types/express@5's template-literal param inference resolving to
// `string | string[]` for every route in this TS toolchain — a types-only
// false positive; Express itself always hands back plain strings here.
export interface AuthedRequest<P extends Record<string, string> = Record<string, string>>
  extends Request<P> {
  userId?: string;
  userEmail?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}
