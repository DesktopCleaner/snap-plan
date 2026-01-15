// Vercel serverless function for /api/auth/user
import cookie from 'cookie';

export default async function handler(req, res) {
  // Set CORS headers
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse cookies
    const cookies = cookie.parse(req.headers.cookie || '');
    let accessToken = cookies.access_token;
    const refreshToken = cookies.refresh_token;
    
    if (!accessToken && !refreshToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Verify token by fetching user info
    let userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    
    // If access token is expired, try to refresh it
    if (!userInfoResponse.ok && refreshToken) {
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
        
        // Retry user info fetch with new token
        userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } catch (refreshError) {
        console.error('Token refresh error:', refreshError);
        res.setHeader('Set-Cookie', [
          'access_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
          'refresh_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
        ]);
        return res.status(401).json({ error: 'Failed to refresh session. Please sign in again.' });
      }
    }
    
    if (!userInfoResponse.ok) {
      // Token invalid and no refresh token, clear cookies
      res.setHeader('Set-Cookie', [
        'access_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
        'refresh_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
      ]);
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    const userInfo = await userInfoResponse.json();
    
    res.json({
      user: {
        name: userInfo.name || userInfo.email,
        email: userInfo.email
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

