import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

interface Session {
  userId: string;
  expiresAt: number;
}

// In-memory session store (replace with Redis/DB for production)
export const sessionStore = new Map<string, Session>();

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionToken = req.cookies?.session;

  if (!sessionToken) {
    res.status(401).json({ error: 'Unauthorized: No session token' });
    return;
  }

  const session = sessionStore.get(sessionToken);

  if (!session) {
    res.status(401).json({ error: 'Unauthorized: Invalid session' });
    return;
  }

  if (Date.now() > session.expiresAt) {
    sessionStore.delete(sessionToken);
    res.status(401).json({ error: 'Unauthorized: Session expired' });
    return;
  }

  req.userId = session.userId;
  next();
}
