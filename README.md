## SnapPlan

SnapPlan is a client-side website (built with Vite + React) that lets you:

- Sign in with Google and access your Google Calendar
- Use your camera (or upload a photo)
- Extract text from the photo (OCR via Tesseract.js) - **all done in your browser**
- Send the text to an AI to auto-generate events (or use a heuristic fallback) - **all done in your browser**
- Create events directly in your Google Calendar (primary flow)
- Optionally download an `.ics` file of parsed events

### Prerequisites

- Node.js 18+
- Google Cloud OAuth 2.0 Client (Web application)

### Environment Variables

**Step 1: Create a `.env` file**

Create a `.env` file in the project root (`/Users/shepherd/snapplan/.env`) with the following content:

```env
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
VITE_GEMINI_API_KEY=your-gemini-api-key
VITE_GEMINI_MODEL=gemini-1.5-flash

# Optional: force using heuristic parser only
# VITE_AI_PARSE_MODE=local
```

**Step 2: Get your Google OAuth Client ID**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the **Google Calendar API**:
   - Go to "APIs & Services" > "Library"
   - Search for "Google Calendar API"
   - Click "Enable"
4. Create OAuth 2.0 credentials:
   - Go to "APIs & Services" > "Credentials"
   - Click "Create Credentials" > "OAuth client ID"
   - Choose "Web application"
   - Add authorized JavaScript origins:
     - `http://localhost:3000` (for development)
   - Copy the **Client ID** (looks like: `xxxxx.apps.googleusercontent.com`)
   - Paste it into your `.env` file as `VITE_GOOGLE_CLIENT_ID`

**Step 3: Get your Gemini API Key**

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Get API key" or "Create API key"
3. Select your Google Cloud project (or create a new one)
4. Copy the API key
5. Paste it into your `.env` file as `VITE_GEMINI_API_KEY`
6. **Important**: Enable the Gemini API in Google Cloud Console:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to "APIs & Services" > "Library"
   - Search for "Generative Language API" or "Gemini API"
   - Click "Enable"

**Step 4: Restart the dev server**

After creating/updating your `.env` file, **restart the Vite dev server**:

```bash
# Stop the current server (Ctrl+C)
npm run dev
```

**Important Notes:**
- All environment variables must be prefixed with `VITE_` to be accessible in the browser
- The `.env` file should be in the project root (same directory as `package.json`)
- The Gemini API key will be visible in the browser (this is expected for client-side apps)
- For production, consider using environment-specific API keys with restricted scopes
- If you see a 404 error for Gemini API, make sure:
  1. The Gemini API is enabled in Google Cloud Console
  2. Your API key is valid
  3. The model name is correct (try: `gemini-1.5-flash`, `gemini-1.5-pro`, or `gemini-pro`)

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google Calendar API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized JavaScript origins:
   - `http://localhost:3000` (for development)
   - Your production domain (for deployment)
6. Required OAuth scopes:
   - `https://www.googleapis.com/auth/calendar`

### Install & Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in your browser.

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory. You can deploy this to any static hosting service (Netlify, Vercel, GitHub Pages, etc.).

### Architecture

This is a **fully client-side application**:
- ✅ All processing happens in the browser (OCR, AI parsing)
- ✅ No server required (can be deployed as static files)
- ✅ Google OAuth handled via Google Identity Services
- ✅ Calendar API calls made directly from browser
- ✅ ICS generation done client-side

### Notes

- If `VITE_GEMINI_API_KEY` is not set, the app uses a simple heuristic to generate one placeholder 1-hour event from the text.
- All OCR is done client-side using `tesseract.js` in the browser.
- Calendar events are inserted into the `primary` calendar with start/end as ISO dateTimes.
- ICS is optional and available for download after parsing (not required for Google insertion).
- The app works offline for OCR and parsing (if Gemini API key is provided), but requires internet for Google Calendar integration.


