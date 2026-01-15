// Vercel serverless function for /api/auth/callback
import cookie from 'cookie';
import { setCORSHeaders, handlePreflight } from '../utils/cors.js';
import { rateLimitMiddleware } from '../utils/rateLimit.js';

export default async function handler(req, res) {
  // Set CORS headers
  setCORSHeaders(req, res, ['POST', 'OPTIONS']);

  // Handle preflight
  if (handlePreflight(req, res, ['POST', 'OPTIONS'])) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting: 5 OAuth callbacks per minute per IP (prevent abuse)
  const rateLimitResult = rateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 5
  })(req, res);
  
  if (rateLimitResult) {
    return rateLimitResult; // Rate limit exceeded
  }

  try {
    const { code, redirect_uri: clientRedirectUri } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = clientRedirectUri || process.env.GOOGLE_REDIRECT_URI || 
      `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}`;
    
    if (!clientSecret) {
      console.error('GOOGLE_CLIENT_SECRET not set');
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_CLIENT_SECRET not set' 
      });
    }
    
    // Build token exchange request body
    // Note: We don't include code_verifier when using client_secret
    // Google doesn't require PKCE for confidential clients
    const tokenParams = {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
      // No code_verifier - not needed with client_secret
    };
    
    // Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(tokenParams)
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.json().catch(() => ({ error: 'Unknown error' }));
      console.error('Token exchange error:', error);
      return res.status(tokenResponse.status).json({ 
        error: 'Failed to exchange authorization code',
        details: error.error || error.error_description
      });
    }
    
    const tokens = await tokenResponse.json();
    
    // Get user info
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });
    
    if (!userInfoResponse.ok) {
      return res.status(userInfoResponse.status).json({ 
        error: 'Failed to fetch user info' 
      });
    }
    
    const userInfo = await userInfoResponse.json();
    
    // Set httpOnly cookies for tokens
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    };
    
    // 4 months = 120 days = 10,368,000 seconds
    const fourMonthsInSeconds = 120 * 24 * 60 * 60;
    
    res.setHeader('Set-Cookie', [
      `access_token=${tokens.access_token}; HttpOnly; ${cookieOptions.secure ? 'Secure;' : ''} SameSite=${cookieOptions.sameSite}; Max-Age=${tokens.expires_in || 3600}; Path=${cookieOptions.path}`,
      tokens.refresh_token ? `refresh_token=${tokens.refresh_token}; HttpOnly; ${cookieOptions.secure ? 'Secure;' : ''} SameSite=${cookieOptions.sameSite}; Max-Age=${fourMonthsInSeconds}; Path=${cookieOptions.path}` : '',
      `pkce_verifier=; HttpOnly; ${cookieOptions.secure ? 'Secure;' : ''} SameSite=${cookieOptions.sameSite}; Max-Age=0; Path=/` // Clear PKCE verifier
    ].filter(Boolean));
    
    res.json({
      success: true,
      user: {
        name: userInfo.name || userInfo.email,
        email: userInfo.email
      }
    });
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

