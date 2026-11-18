import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  timestamps: number[];
  lastRequestTime: number;
}

interface RateLimitConfig {
  windowMs: number;          // Time window in ms (e.g. 15 * 60 * 1000)
  max: number;               // Max allowed attempts in window
  message: string;           // Custom error message
  cooldownMs?: number;       // Optional minimum interval between requests (e.g. 60s)
  cooldownMessage?: string;  // Custom cooldown message
  keyGenerator?: (req: Request) => string;
}

/**
 * Extract client IP address safely considering reverse proxies
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Creates an in-memory sliding-window rate limiter middleware with auto-cleanup
 */
export function createRateLimiter(config: RateLimitConfig) {
  const store = new Map<string, RateLimitRecord>();

  // Periodically clean up stale entries every 5 minutes
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      record.timestamps = record.timestamps.filter((t) => now - t < config.windowMs);
      if (record.timestamps.length === 0 && now - record.lastRequestTime > config.windowMs) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = config.keyGenerator ? config.keyGenerator(req) : getClientIp(req);

    let record = store.get(key);
    if (!record) {
      record = { timestamps: [], lastRequestTime: 0 };
      store.set(key, record);
    }

    // Check cooldown (e.g., minimum 60 seconds between resends)
    if (config.cooldownMs && record.lastRequestTime > 0) {
      const timeSinceLast = now - record.lastRequestTime;
      if (timeSinceLast < config.cooldownMs) {
        const remainingSeconds = Math.ceil((config.cooldownMs - timeSinceLast) / 1000);
        res.setHeader('Retry-After', remainingSeconds);
        res.status(429).json({
          message: config.cooldownMessage || `Please wait ${remainingSeconds} seconds before trying again.`,
          retryAfter: remainingSeconds,
        });
        return;
      }
    }

    // Filter out timestamps outside sliding window
    record.timestamps = record.timestamps.filter((t) => now - t < config.windowMs);

    // Check if max attempts reached
    if (record.timestamps.length >= config.max) {
      const oldestInWindow = record.timestamps[0];
      const resetInSeconds = Math.ceil((oldestInWindow + config.windowMs - now) / 1000);
      res.setHeader('Retry-After', resetInSeconds);
      res.setHeader('X-RateLimit-Limit', config.max);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', Math.ceil((oldestInWindow + config.windowMs) / 1000));
      res.status(429).json({
        message: config.message,
        retryAfter: resetInSeconds,
      });
      return;
    }

    // Record this attempt
    record.timestamps.push(now);
    record.lastRequestTime = now;

    res.setHeader('X-RateLimit-Limit', config.max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, config.max - record.timestamps.length));

    next();
  };
}

/**
 * 1. Login Rate Limiter:
 * 8 attempts per 15 minutes per IP + email
 */
export const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many login attempts. For your account security, please wait 15 minutes before trying again.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || '').trim().toLowerCase();
    return email ? `login:${ip}:${email}` : `login:${ip}`;
  },
});

/**
 * 2. Send / Resend Sign-Up Email OTP Rate Limiter:
 * 5 requests per 15 minutes, with minimum 60-second cooldown between resends
 */
export const otpRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  cooldownMs: 60 * 1000, // 60s cooldown
  cooldownMessage: 'Please wait at least 60 seconds before requesting a new verification code.',
  message: 'Too many verification code requests. Please wait 15 minutes before requesting again.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || '').trim().toLowerCase();
    return email ? `otp:${ip}:${email}` : `otp:${ip}`;
  },
});

/**
 * 3. Forgot Password Rate Limiter:
 * 4 requests per 15 minutes, with minimum 60-second cooldown
 */
export const forgotPasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 4,
  cooldownMs: 60 * 1000, // 60s cooldown
  cooldownMessage: 'A password reset link was recently sent. Please wait 60 seconds before requesting another.',
  message: 'Too many password reset requests. Please wait 15 minutes before trying again.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || '').trim().toLowerCase();
    return email ? `forgot:${ip}:${email}` : `forgot:${ip}`;
  },
});

/**
 * 4. TOTP Verification Rate Limiter:
 * 8 attempts per 15 minutes (protects against 6-digit brute force)
 */
export const totpVerifyRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: 'Too many invalid authenticator code attempts. Please wait 15 minutes before trying again.',
  keyGenerator: (req) => {
    const ip = getClientIp(req);
    const email = (req.body?.email || '').trim().toLowerCase();
    return email ? `totp:${ip}:${email}` : `totp:${ip}`;
  },
});

