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
# Backend environment variables (NOT prefixed with VITE_)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash

# Optional: force using heuristic parser only
# AI_PARSE_MODE=local

# Optional: Backend server port (defaults to 3001)
# PORT=3001

# Optional: Frontend backend URL (defaults to http://localhost:3001)
# VITE_BACKEND_URL=http://localhost:3001
```

**Important**: All sensitive environment variables are now stored on the backend server and are NOT exposed to the browser. Only the backend URL (if custom) needs the `VITE_` prefix.

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
   - Paste it into your `.env` file as `GOOGLE_CLIENT_ID` (no VITE_ prefix)

**Step 3: Get your Gemini API Key**

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Get API key" or "Create API key"
3. Select your Google Cloud project (or create a new one)
4. Copy the API key
5. Paste it into your `.env` file as `GEMINI_API_KEY` (no VITE_ prefix)
6. **Important**: Enable the Gemini API in Google Cloud Console:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to "APIs & Services" > "Library"
   - Search for "Generative Language API" or "Gemini API"
   - Click "Enable"

**Step 4: Install dependencies and start servers**

First, install dependencies:

```bash
npm install
```

Then start both the backend and frontend servers:

```bash
npm run dev:all
```

This will start:
- Backend server on `http://localhost:3001` (handles API keys securely)
- Frontend dev server on `http://localhost:3000` (Vite)

Alternatively, you can run them separately:

```bash
# Terminal 1: Backend server
npm run dev:server

# Terminal 2: Frontend dev server
npm run dev
```

**Step 5: Restart servers after .env changes**

After creating/updating your `.env` file, **restart both servers**:

```bash
# Stop both servers (Ctrl+C in each terminal, or Ctrl+C if using npm run dev:all)
# Then restart:
npm run dev:all
```

**Important Notes:**
- **All sensitive environment variables are now stored on the backend server** and are NOT exposed to the browser
- Environment variables for the backend should NOT have the `VITE_` prefix
- Only `VITE_BACKEND_URL` (if you need to customize it) should have the `VITE_` prefix
- The `.env` file should be in the project root (same directory as `package.json`)
- The backend server proxies all API calls, keeping your API keys secure
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

- If the backend server is not running or `GEMINI_API_KEY` is not set, the app uses a simple heuristic to generate one placeholder 1-hour event from the text.
- All OCR is done client-side using `tesseract.js` in the browser.
- Calendar events are inserted into the `primary` calendar with start/end as ISO dateTimes.
- ICS is optional and available for download after parsing (not required for Google insertion).
- The app works offline for OCR and parsing (if Gemini API key is provided), but requires internet for Google Calendar integration.


