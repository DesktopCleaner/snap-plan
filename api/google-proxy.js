// Vercel serverless function for /api/google-proxy
import cookie from 'cookie';
import { setCORSHeaders, handlePreflight } from './utils/cors.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';

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

  // Rate limiting: 20 Google API proxy requests per minute per IP
  const rateLimitResult = rateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 20
  })(req, res);
  
  if (rateLimitResult) {
    return rateLimitResult; // Rate limit exceeded
  }

  try {
    // Parse cookies
    const cookies = cookie.parse(req.headers.cookie || '');
    let accessToken = cookies.access_token;
    const refreshToken = cookies.refresh_token;
    
    if (!accessToken && !refreshToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const { url, method = 'GET', headers = {}, body } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }
    
    // Only allow Google APIs
    if (!url.startsWith('https://www.googleapis.com/')) {
      return res.status(403).json({ error: 'Only Google APIs are allowed' });
    }
    
    // Make request to Google API with token from cookie
    const proxyHeaders = {
      ...headers,
      Authorization: `Bearer ${accessToken}`,
    };
    
    let proxyResponse = await fetch(url, {
      method,
      headers: proxyHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    // If access token expired, try to refresh it
    if (proxyResponse.status === 401 && refreshToken) {
      try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
        
        if (!clientSecret) {
          throw new Error('GOOGLE_CLIENT_SECRET not configured');
        }
        
        // Refresh the access token
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
          }),
        });
        
        if (!refreshResponse.ok) {
          // Refresh token is invalid, clear cookies
          res.setHeader('Set-Cookie', [
            'access_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
            'refresh_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
          ]);
          return res.status(401).json({ error: 'Session expired. Please sign in again.' });
        }
        
        const newTokens = await refreshResponse.json();
        accessToken = newTokens.access_token;
        
        // Update access token cookie
        const cookieOptions = {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          path: '/',
        };
        
        res.setHeader('Set-Cookie', `access_token=${accessToken}; HttpOnly; ${cookieOptions.secure ? 'Secure;' : ''} SameSite=${cookieOptions.sameSite}; Max-Age=${newTokens.expires_in || 3600}; Path=${cookieOptions.path}`);
        
        // Retry the request with new token
        proxyHeaders.Authorization = `Bearer ${accessToken}`;
        proxyResponse = await fetch(url, {
          method,
          headers: proxyHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (refreshError) {
        console.error('Token refresh error in proxy:', refreshError);
        res.setHeader('Set-Cookie', [
          'access_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
          'refresh_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
        ]);
        return res.status(401).json({ error: 'Session expired. Please sign in again.' });
      }
    }
    
    // Forward response
    const responseData = await proxyResponse.text();
    const contentType = proxyResponse.headers.get('content-type') || 'application/json';
    
    res.setHeader('Content-Type', contentType);
    res.status(proxyResponse.status);
    
    // Try to parse as JSON, otherwise send as text
    try {
      const jsonData = JSON.parse(responseData);
      res.json(jsonData);
    } catch {
      res.send(responseData);
    }
  } catch (error) {
    console.error('Google API proxy error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

