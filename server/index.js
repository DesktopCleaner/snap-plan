import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Config endpoint - provides non-sensitive config to frontend
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    aiParseMode: process.env.AI_PARSE_MODE || '',
  });
});

// Helper function to call Gemini API
async function callGeminiAPI(apiKey, endpoint, modelName, parts) {
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

// Proxy endpoint for Gemini API
app.post('/api/gemini', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'GEMINI_API_KEY is not set in server environment variables' 
      });
    }

    const { model = 'gemini-2.0-flash', prompt, imageData, mimeType } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

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

    // Try different models and endpoints in order of preference
    let resp = null;
    const modelsToTry = [
      model,
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
        
        resp = await callGeminiAPI(apiKey, endpointToTry, modelToTry, parts);
        
        if (resp.ok) {
          console.log(`✅ Successfully connected to model: "${modelToTry}" via ${endpointToTry}`);
          const data = await resp.json();
          return res.json(data);
        }
        
        // If 404, try next model
        if (resp.status === 404) {
          console.warn(`Model "${modelToTry}" not found via ${endpointToTry}, trying next...`);
          continue;
        } else {
          // If it's not a 404, don't try other models (might be auth error, etc.)
          console.error(`Non-404 error (${resp.status}) for "${modelToTry}" via ${endpointToTry}, stopping model fallback`);
          break;
        }
      }
      
      // If we got a successful response, break out of endpoint loop
      if (resp && resp.ok) {
        break;
      }
    }
    
    // If all models failed, return error
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
    
    console.error('Gemini API call failed:', errorDetails);
    return res.status(resp.status).json({ 
      error: `Gemini API error: ${resp.status}`,
      details: errorDetails,
      message: errorMessage
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📝 Gemini API key: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`📝 Google Client ID: ${process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Not set'}`);
  console.log(`📝 Gemini Model: ${process.env.GEMINI_MODEL || 'gemini-2.0-flash'}`);
});

