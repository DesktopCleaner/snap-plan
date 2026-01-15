// Vercel serverless function for /api/auth/pkce
import crypto from 'crypto';
import { setCORSHeaders, handlePreflight } from '../utils/cors.js';
import { rateLimitMiddleware } from '../utils/rateLimit.js';

export default function handler(req, res) {
  // Set CORS headers
  setCORSHeaders(req, res, ['GET', 'OPTIONS']);

  // Handle preflight
  if (handlePreflight(req, res, ['GET', 'OPTIONS'])) {
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 10 PKCE challenges per minute per IP
  const rateLimitResult = rateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 10
  })(req, res);
  
  if (rateLimitResult) {
    return rateLimitResult; // Rate limit exceeded
  }

  try {
    // Generate code verifier (43-128 characters, URL-safe)
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    
    // Generate code challenge (SHA256 hash of verifier, base64url encoded)
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    
    // Store verifier in httpOnly cookie (expires in 10 minutes)
    res.setHeader('Set-Cookie', `pkce_verifier=${codeVerifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`);
    
    res.json({
      codeChallenge,
      codeChallengeMethod: 'S256'
    });
  } catch (error) {
    console.error('PKCE generation error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

