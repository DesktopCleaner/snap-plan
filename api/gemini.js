// Vercel serverless function for /api/gemini
import { setCORSHeaders, handlePreflight } from './utils/cors.js';
import { rateLimitMiddleware } from './utils/rateLimit.js';
import { validateRequestBody } from './utils/validation.js';

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

  // Rate limiting: 10 requests per minute per IP
  const rateLimitResult = rateLimitMiddleware({
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyGenerator: (req) => {
      return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.headers['x-real-ip'] || 
             'unknown';
    }
  })(req, res);
  
  if (rateLimitResult) {
    return rateLimitResult; // Rate limit exceeded
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'GEMINI_API_KEY is not set in server environment variables' 
      });
    }

    // Validate request body
    const validation = validateRequestBody(req.body, true);
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validation.errors
      });
    }

    // Get default model from environment variable
    const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const { model = defaultModel, prompt, imageData, mimeType } = req.body;

    // Build parts for API call
    const parts = [{ text: prompt }];
    
    // Add image if provided
    if (imageData && mimeType) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: imageData
        }
      });
    }

    // Helper function to call Gemini API
    async function callGeminiAPI(endpoint, modelName, parts) {
      const url = `https://generativelanguage.googleapis.com/${endpoint}/models/${modelName}:generateContent?key=${apiKey}`;
      
      const generationConfig = {
        temperature: 0.2,
      };
      
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: parts,
          }],
          generationConfig: generationConfig,
        }),
      });
    }

    // Try different models and endpoints in order of preference
    let resp = null;
    const modelsToTry = [
      model,
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
      'gemini-pro',
      'gemini-2.0-pro',
      'gemini-1.5-pro',
      'gemini-2.0-flash-lite',
      'gemini-2.0-flash-exp',
    ];
    
    const uniqueModels = [...new Set(modelsToTry)];
    const endpointsToTry = ['v1beta', 'v1'];
    
    for (const endpointToTry of endpointsToTry) {
      for (const modelToTry of uniqueModels) {
        console.log(`Trying model: "${modelToTry}" via ${endpointToTry}`);
        
        resp = await callGeminiAPI(endpointToTry, modelToTry, parts);
        
        if (resp.ok) {
          console.log(`✅ Successfully connected to model: "${modelToTry}" via ${endpointToTry}`);
          const data = await resp.json();
          return res.json(data);
        }
        
        // If 404, try next model
        if (resp.status === 404) {
          console.warn(`Model "${modelToTry}" not found via ${endpointToTry}, trying next...`);
          continue;
        } else if (resp.status === 429) {
          // Quota error - try other models as they might have different quotas
          console.warn(`Model "${modelToTry}" quota exceeded (429) via ${endpointToTry}, trying next model...`);
          continue;
        } else if (resp.status === 401 || resp.status === 403) {
          // Auth errors - won't work with other models either, stop trying
          console.error(`Auth error (${resp.status}) for "${modelToTry}" via ${endpointToTry}, stopping model fallback`);
          break;
        } else {
          // Other errors - try next model (might be temporary issue or model-specific)
          console.warn(`Error ${resp.status} for "${modelToTry}" via ${endpointToTry}, trying next model...`);
          continue;
        }
      }
      
      // If we got a successful response, break out of endpoint loop
      if (resp && resp.ok) {
        break;
      }
    }
    
    // If all models failed, return error
    if (!resp) {
      return res.status(500).json({ 
        error: 'All Gemini models failed - no response received',
        details: 'Tried all available models and endpoints but received no response'
      });
    }
    
    let errorDetails = 'Unknown error';
    let errorMessage = '';
    
    try {
      const errorData = await resp.json();
      errorMessage = errorData?.error?.message || '';
      errorDetails = errorData?.error?.message || errorData?.error || `HTTP ${resp.status}`;
    } catch (e) {
      const text = await resp.text().catch(() => '');
      errorDetails = text || `HTTP ${resp.status} ${resp.statusText}`;
    }
    
    console.error('All Gemini models failed. Last error:', errorDetails);
    return res.status(resp.status).json({ 
      error: `Gemini API error: ${resp.status}`,
      details: errorDetails,
      message: errorMessage
    });
  } catch (error) {
    console.error('Server error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
}

