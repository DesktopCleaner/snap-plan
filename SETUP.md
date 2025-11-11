# SnapPlan Setup Guide

## Quick Setup

### 1. Create `.env` file

Create a file named `.env` in the project root with:

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id-here
VITE_GEMINI_API_KEY=your-gemini-api-key-here
VITE_GEMINI_MODEL=gemini-1.5-flash
```

### 2. Get Google OAuth Client ID

1. Visit: https://console.cloud.google.com/
2. Create/select a project
3. Enable "Google Calendar API"
4. Create OAuth 2.0 credentials (Web application)
5. Add `http://localhost:3000` to authorized origins
6. Copy the Client ID to `.env`

### 3. Get Gemini API Key

1. Visit: https://aistudio.google.com/app/apikey
2. Create API key
3. Enable "Generative Language API" in Google Cloud Console
4. Copy the API key to `.env`

### 4. Restart Dev Server

```bash
npm run dev
```

## Troubleshooting

### Gemini API 404 Error

- Make sure "Generative Language API" is enabled in Google Cloud Console
- Verify your API key is correct
- Try different model names: `gemini-1.5-flash`, `gemini-1.5-pro`, `gemini-pro`

### Google Login Not Working

- Check that `VITE_GOOGLE_CLIENT_ID` is set in `.env`
- Verify `http://localhost:3000` is in authorized origins
- Restart the dev server after changing `.env`
