// Vercel serverless function for /api/auth/signout
import { setCORSHeaders, handlePreflight } from '../utils/cors.js';

export default function handler(req, res) {
  // Set CORS headers
  setCORSHeaders(req, res, ['POST', 'OPTIONS']);

  // Handle preflight
  if (handlePreflight(req, res, ['POST', 'OPTIONS'])) {
    return;
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

