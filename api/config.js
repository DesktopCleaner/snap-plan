// Vercel serverless function for /api/config
import { setCORSHeaders, handlePreflight } from './utils/cors.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';

export default async function handler(req, res) {
  try {
    // Set CORS headers first
    setCORSHeaders(req, res, ['GET', 'OPTIONS']);

    // Handle preflight
    if (handlePreflight(req, res, ['GET', 'OPTIONS'])) {
      return;
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limiting: 30 requests per minute per IP (config endpoint is less critical)
    try {
      const rateLimitResult = rateLimitMiddleware({
        windowMs: 60 * 1000,
        maxRequests: 30
      })(req, res);
      
      if (rateLimitResult) {
        return rateLimitResult; // Rate limit exceeded
      }
    } catch (rateLimitError) {
      console.error('Rate limit error:', rateLimitError);
      // Continue if rate limiting fails (don't block the request)
    }

    // Get default model from environment variable
    const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    
    res.json({
      googleClientId: process.env.GOOGLE_CLIENT_ID || '',
      geminiModel: process.env.GEMINI_MODEL || defaultModel,
      aiParseMode: process.env.AI_PARSE_MODE || '',
    });
  } catch (error) {
    console.error('Config endpoint error:', error);
    // Set CORS headers even on error
    setCORSHeaders(req, res, ['GET', 'OPTIONS']);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred'
    });
  }
}

