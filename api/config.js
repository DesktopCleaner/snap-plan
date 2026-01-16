// Vercel serverless function for /api/config
export default function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get default model from environment variable
  const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    geminiModel: process.env.GEMINI_MODEL || defaultModel,
    aiParseMode: process.env.AI_PARSE_MODE || '',
  });
}

