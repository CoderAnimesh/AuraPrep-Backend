import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET environment variable is not defined.');
    }
    return 'auraprep_secret_key_12345';
  }
  return secret;
}

export interface AuthRequest extends Request {
  userId?: string;
}

export function extractOptionalUserId(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, getJwtSecret()) as { userId: string };
      return decoded.userId;
    } catch {
      return null;
    }
  }
  return null;
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ') && authHeader.split(' ')[1];

  if (!token) {
    res.status(401).json({ message: 'Authentication token required.' });
    return;
  }

  jwt.verify(token, getJwtSecret(), (err, decoded) => {
    if (err) {
      res.status(403).json({ message: 'Invalid or expired token.' });
      return;
    }
    req.userId = (decoded as any).userId;
    next();
  });
}

