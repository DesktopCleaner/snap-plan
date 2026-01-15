// Simple in-memory rate limiting for Vercel serverless functions
// Note: In production with multiple instances, consider using Redis or Vercel Edge Config

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

export function rateLimit(req, options = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute window
    maxRequests = 10, // max requests per window
    keyGenerator = (req) => {
      // Use IP address or user ID if available
      return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.headers['x-real-ip'] || 
             'unknown';
    },
    skipOnSuccess = false
  } = options;

  const key = `ratelimit:${keyGenerator(req)}`;
  const now = Date.now();
  
  const record = rateLimitStore.get(key);
  
  if (!record || record.expiresAt < now) {
    // Create new record
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
      expiresAt: now + windowMs + (60 * 1000) // Keep for 1 minute after window
    });
    return { allowed: true, remaining: maxRequests - 1 };
  }
  
  if (record.count >= maxRequests) {
    return { 
      allowed: false, 
      remaining: 0,
      resetAt: record.resetAt
    };
  }
  
  record.count += 1;
  rateLimitStore.set(key, record);
  
  return { 
    allowed: true, 
    remaining: maxRequests - record.count,
    resetAt: record.resetAt
  };
}

export function rateLimitMiddleware(options) {
  return (req, res) => {
    const result = rateLimit(req, options);
    
    if (!result.allowed) {
      res.setHeader('X-RateLimit-Limit', options.maxRequests);
      res.setHeader('X-RateLimit-Remaining', 0);
      res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again after ${new Date(result.resetAt).toLocaleString()}`,
        retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000)
      });
    }
    
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(result.resetAt).toISOString());
    
    return null; // Continue processing
  };
}

