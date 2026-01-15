import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

// Get default model from environment variable
const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000', // Match Vite port in vite.config.ts
  credentials: true // Allow cookies
}));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Config endpoint - provides non-sensitive config to frontend
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    geminiModel: process.env.GEMINI_MODEL || defaultModel,
    aiParseMode: process.env.AI_PARSE_MODE || '',
  });
});

// In-memory store for PKCE code verifiers (in production, use Redis or database)
const codeVerifierStore = new Map();

// Generate PKCE code verifier and challenge
app.get('/api/auth/pkce', (req, res) => {
  // Generate code verifier (43-128 characters, URL-safe)
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  
  // Generate code challenge (SHA256 hash of verifier, base64url encoded)
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  
  // Store verifier temporarily (expires in 10 minutes)
  const storeKey = crypto.randomBytes(16).toString('hex');
  codeVerifierStore.set(storeKey, {
    verifier: codeVerifier,
    expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
  });
  
  // Clean up expired entries
  for (const [key, value] of codeVerifierStore.entries()) {
    if (value.expiresAt < Date.now()) {
      codeVerifierStore.delete(key);
    }
  }
  
  // Set verifier in httpOnly cookie
  res.cookie('pkce_verifier_key', storeKey, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000 // 10 minutes
  });
  
  res.json({
    codeChallenge,
    codeChallengeMethod: 'S256'
  });
});

// OAuth callback endpoint - exchanges authorization code for tokens
app.post('/api/auth/callback', async (req, res) => {
  try {
    const { code, redirect_uri: clientRedirectUri } = req.body;
    const verifierKey = req.cookies?.pkce_verifier_key;
    
    if (!code) {
      return res.status(400).json({ error: 'Authorization code is required' });
    }
    
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    // Use the redirect_uri from the client (frontend) to ensure exact match
    // This must match exactly what was used in the authorization request
    const redirectUri = clientRedirectUri || process.env.GOOGLE_REDIRECT_URI || 
      (process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`
        : 'http://localhost:3000'); // Frontend origin, not backend
    
    if (!clientSecret) {
      console.error('GOOGLE_CLIENT_SECRET not set');
      return res.status(500).json({ 
        error: 'Server configuration error: GOOGLE_CLIENT_SECRET not set' 
      });
    }
    
    // Clean up PKCE verifier if it exists (we don't use it with client_secret)
    if (verifierKey) {
      const stored = codeVerifierStore.get(verifierKey);
      if (stored) {
        codeVerifierStore.delete(verifierKey);
      }
      res.clearCookie('pkce_verifier_key');
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
      const errorText = await tokenResponse.text();
      let error;
      try {
        error = JSON.parse(errorText);
      } catch {
        error = { error: errorText };
      }
      
      console.error('Token exchange error:', {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: error,
        redirectUri: redirectUri,
        hasCode: !!code,
        codeLength: code?.length,
        hasClientSecret: !!clientSecret,
        hasClientId: !!clientId
      });
      
      return res.status(tokenResponse.status).json({ 
        error: 'Failed to exchange authorization code',
        details: error.error || error.error_description || JSON.stringify(error),
        redirectUri: redirectUri,
        hint: 'Make sure redirect_uri matches exactly what was used in the authorization request'
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
    res.cookie('access_token', tokens.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: (tokens.expires_in || 3600) * 1000 // Default 1 hour
    });
    
    if (tokens.refresh_token) {
      // 4 months = 120 days
      const fourMonthsInMs = 120 * 24 * 60 * 60 * 1000;
      res.cookie('refresh_token', tokens.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: fourMonthsInMs // 4 months
      });
    }
    
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
});

// Get current user (validates token from cookie)
app.get('/api/auth/user', async (req, res) => {
  try {
    let accessToken = req.cookies?.access_token;
    const refreshToken = req.cookies?.refresh_token;
    
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
          res.clearCookie('access_token');
          res.clearCookie('refresh_token');
          return res.status(401).json({ error: 'Session expired. Please sign in again.' });
        }
        
        const newTokens = await refreshResponse.json();
        accessToken = newTokens.access_token;
        
        // Update access token cookie
        res.cookie('access_token', accessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: (newTokens.expires_in || 3600) * 1000
        });
        
        // Retry user info fetch with new token
        userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });
      } catch (refreshError) {
        console.error('Token refresh error:', refreshError);
        res.clearCookie('access_token');
        res.clearCookie('refresh_token');
        return res.status(401).json({ error: 'Failed to refresh session. Please sign in again.' });
      }
    }
    
    if (!userInfoResponse.ok) {
      // Token invalid and no refresh token, clear cookies
      res.clearCookie('access_token');
      res.clearCookie('refresh_token');
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
});

// Sign out endpoint
app.post('/api/auth/signout', (req, res) => {
  res.clearCookie('access_token');
  res.clearCookie('refresh_token');
  res.json({ success: true });
});

// Google API proxy endpoint - proxies requests to Google APIs using token from cookie
app.post('/api/google-proxy', async (req, res) => {
  try {
    const accessToken = req.cookies?.access_token;
    
    if (!accessToken) {
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
    
    const proxyResponse = await fetch(url, {
      method,
      headers: proxyHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
    
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

    const { model = defaultModel, prompt, imageData, mimeType } = req.body;

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
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.5-flash',
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
  console.log(`📝 Gemini Model: ${process.env.GEMINI_MODEL || defaultModel}`);
});

