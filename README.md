# SnapPlan

SnapPlan is a web application that lets you quickly create calendar events from photos or text. Simply take a photo of an event poster, upload event images, or paste text, and SnapPlan will automatically extract and parse the event details using AI, then add them to your Google Calendar.

## Features

- 📷 **Camera Capture** - Take photos directly from your device
- 📁 **Bulk Upload** - Upload multiple images at once for batch processing
- 📝 **Text Input** - Paste or type event information directly
- 🤖 **AI-Powered Parsing** - Uses Google Gemini AI to intelligently extract event details
- 📅 **Google Calendar Integration** - Create events directly in your Google Calendar
- 📥 **ICS Export** - Download events as `.ics` files for other calendar apps
- 🔒 **Secure** - API keys stored securely on the backend server

## Architecture

This application consists of:
- **Frontend**: React + Vite (client-side UI)
- **Backend**: Node.js/Express server (handles API keys securely)
- **Deployment**: Vercel (frontend + serverless functions)

The backend server proxies API calls to keep sensitive keys secure and never exposes them to the browser.

## Prerequisites

- Node.js 18+
- Google Cloud OAuth 2.0 Client (Web application)
- Google Gemini API Key

## Quick Start

### Local Development

1. **Clone the repository** (if applicable)

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   
   Create a `.env` file in the project root with:
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

4. **Start the development servers**:
   ```bash
   npm run dev:all
   ```
   
   This starts:
   - Backend server on `http://localhost:3001`
   - Frontend dev server on `http://localhost:3000`

   Or run them separately:
   ```bash
   # Terminal 1: Backend server
   npm run dev:server

   # Terminal 2: Frontend dev server
   npm run dev
   ```

5. **Open your browser**:
   Navigate to `http://localhost:3000`

### Production Deployment (Vercel)

See [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md) for detailed deployment instructions.

**Quick deploy**:
```bash
# Install Vercel CLI (already included as dev dependency)
npm install

# Login to Vercel
npx vercel login

# Deploy
npm run vercel

# Add environment variables
npx vercel env add GOOGLE_CLIENT_ID
npx vercel env add GEMINI_API_KEY
npx vercel env add GEMINI_MODEL

# Deploy to production
npm run vercel:prod
```

## Environment Variables Setup

### Step 1: Get Google OAuth Client ID

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
     - Your production domain (e.g., `https://your-app.vercel.app`)
   - Copy the **Client ID** (looks like: `xxxxx.apps.googleusercontent.com`)
   - Paste it into your `.env` file as `GOOGLE_CLIENT_ID`

### Step 2: Get Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Click "Get API key" or "Create API key"
3. Select your Google Cloud project (or create a new one)
4. Copy the API key
5. Paste it into your `.env` file as `GEMINI_API_KEY`
6. **Important**: Enable the Gemini API in Google Cloud Console:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to "APIs & Services" > "Library"
   - Search for "Generative Language API" or "Gemini API"
   - Click "Enable"

### Step 3: Restart Servers

After creating/updating your `.env` file, **restart both servers**:
```bash
# Stop both servers (Ctrl+C)
# Then restart:
npm run dev:all
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 Client ID for Calendar access |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for AI parsing |
| `GEMINI_MODEL` | No | Gemini model to use (default: `gemini-2.0-flash`) |
| `AI_PARSE_MODE` | No | Force local parsing mode if set |
| `PORT` | No | Backend server port (default: `3001`) |
| `VITE_BACKEND_URL` | No | Custom backend URL (defaults to relative URL on Vercel) |

**Important Notes**:
- All sensitive environment variables are stored on the backend server and are **NOT** exposed to the browser
- Environment variables for the backend should **NOT** have the `VITE_` prefix
- Only `VITE_BACKEND_URL` (if you need to customize it) should have the `VITE_` prefix
- For Vercel deployment, add these variables in the Vercel dashboard or via CLI

## Available Scripts

- `npm run dev` - Start frontend dev server
- `npm run dev:server` - Start backend server
- `npm run dev:all` - Start both servers concurrently
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run vercel` - Deploy to Vercel (preview)
- `npm run vercel:prod` - Deploy to Vercel (production)
- `npm run vercel:dev` - Run Vercel dev server locally

## How It Works

1. **Input**: User captures/uploads an image or pastes text
2. **Text Extraction**: If image, OCR extracts text using Tesseract.js (client-side)
3. **AI Parsing**: Text is sent to backend, which proxies to Google Gemini API
4. **Event Parsing**: Gemini AI extracts event details (title, date, time, location, etc.)
5. **Review & Edit**: User can review and edit parsed events in a modal
6. **Calendar Creation**: Events are created in Google Calendar via OAuth
7. **Export**: Optional ICS file download for other calendar apps

## Features in Detail

### Bulk Upload
- Upload multiple images at once
- Each image is processed sequentially
- All events from all images are collected and displayed together
- Progress indicator shows processing status

### AI Parsing
- Uses Google Gemini AI for intelligent event extraction
- Handles various date/time formats
- Supports timezone conversion (defaults to EST)
- Detects all-day events
- Falls back to heuristic parsing if AI is unavailable

### Event Editing
- Edit event details before creating in calendar
- Change timezone display
- Modify title, description, location, dates, and times
- Toggle all-day event status

## Troubleshooting

### Backend Server Not Running
- Make sure you run `npm run dev:server` or `npm run dev:all`
- Check that port 3001 is not in use
- Verify `.env` file exists in project root

### Gemini API Errors
- Verify `GEMINI_API_KEY` is set correctly
- Ensure Gemini API is enabled in Google Cloud Console
- Check API key has proper permissions
- Try a different model name in `GEMINI_MODEL`

### Google Calendar Not Working
- Verify `GOOGLE_CLIENT_ID` is set correctly
- Check authorized JavaScript origins include your domain
- Ensure Google Calendar API is enabled in Google Cloud Console
- Clear browser cache and cookies

### Build Errors
- Run `npm install` to ensure all dependencies are installed
- Check TypeScript errors: `npm run build`
- Verify all environment variables are set

## Deployment

### Vercel (Recommended)

See [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md) for complete deployment guide.

**Quick steps**:
1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Other Platforms

The frontend can be deployed as static files, but you'll need to:
- Deploy the backend server separately
- Update `VITE_BACKEND_URL` to point to your backend
- Ensure CORS is configured correctly

## Security

- API keys are stored securely on the backend server
- Never exposed to the browser/client
- OAuth tokens handled securely via Google Identity Services
- All API calls proxied through backend

## License

[Add your license here]

## Contributing

[Add contributing guidelines here]
