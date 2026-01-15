// CORS utility for API endpoints
// Restricts access to allowed origins only

const ALLOWED_ORIGINS = [
  'https://uwsnapplan.vercel.app',
  'https://snapplan.vercel.app',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
  // Development origins
  ...(process.env.NODE_ENV === 'development' ? [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
  ] : [])
];

// Check if origin is a Vercel preview URL
function isVercelPreviewUrl(origin) {
  if (!origin) return false;
  // Vercel preview URLs follow pattern: https://project-name-*-team.vercel.app
  return /^https:\/\/.*\.vercel\.app$/.test(origin);
}

export function setCORSHeaders(req, res, methods = ['GET', 'POST', 'OPTIONS']) {
  const origin = req.headers.origin;
  
  // Check if origin is allowed
  if (origin) {
    if (ALLOWED_ORIGINS.includes(origin) || isVercelPreviewUrl(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    // If origin doesn't match, don't set CORS headers (will be blocked by browser)
  } else if (process.env.NODE_ENV === 'development') {
    // Allow requests without origin in development (e.g., Postman, curl)
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', methods.join(', '));
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
}

export function handlePreflight(req, res, methods = ['GET', 'POST', 'OPTIONS']) {
  if (req.method === 'OPTIONS') {
    setCORSHeaders(req, res, methods);
    return res.status(200).end();
  }
  return false;
}

