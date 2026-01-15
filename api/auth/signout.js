// Vercel serverless function for /api/auth/signout
export default function handler(req, res) {
  // Set CORS headers
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Clear cookies
  res.setHeader('Set-Cookie', [
    'access_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
    'refresh_token=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/',
    'pkce_verifier=; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Path=/'
  ]);
  
  res.json({ success: true });
}

