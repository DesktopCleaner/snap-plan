// Rate limiting for Express server (similar to Vercel functions)

const rateLimitStore = new Map();

// Clean up old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.expiresAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, 5 * 60 * 1000);

export function createRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000,
    maxRequests = 10,
    keyGenerator = (req) => {
      return req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    }
  } = options;

  return (req, res, next) => {
    const key = `ratelimit:${keyGenerator(req)}`;
    const now = Date.now();
    
    const record = rateLimitStore.get(key);
    
    if (!record || record.expiresAt < now) {
      rateLimitStore.set(key, {
        count: 1,
        resetAt: now + windowMs,
        expiresAt: now + windowMs + (60 * 1000)
      });
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', maxRequests - 1);
      return next();
    }
    
    if (record.count >= maxRequests) {
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(record.resetAt).toISOString());
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again after ${new Date(record.resetAt).toLocaleString()}`,
        retryAfter: Math.ceil((record.resetAt - now) / 1000)
      });
    }
    
    record.count += 1;
    rateLimitStore.set(key, record);
    
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', maxRequests - record.count);
    res.setHeader('X-RateLimit-Reset', new Date(record.resetAt).toISOString());
    
    next();
  };
}

