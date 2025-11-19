# Deploying SnapPlan to Vercel

This guide will help you deploy your SnapPlan application to Vercel.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com))
2. Your environment variables ready:
   - `GOOGLE_CLIENT_ID`
   - `GEMINI_API_KEY`
   - `GEMINI_MODEL` (optional, defaults to `gemini-2.0-flash`)
   - `AI_PARSE_MODE` (optional)

## Deployment Steps

### Option 1: Deploy via Vercel CLI (Recommended)

1. **Install Vercel CLI** (already added as dev dependency):
   ```bash
   npm install
   ```

2. **Login to Vercel**:
   ```bash
   npm run vercel login
   ```
   
   Or use npx:
   ```bash
   npx vercel login
   ```

3. **Deploy to Vercel**:
   ```bash
   npm run vercel
   ```
   
   Or use npx:
   ```bash
   npx vercel
   ```
   
   Follow the prompts:
   - Set up and deploy? **Yes**
   - Which scope? Select your account
   - Link to existing project? **No** (for first deployment)
   - Project name? **snapplan** (or your preferred name)
   - Directory? **./** (current directory)
   - Override settings? **No**

4. **Set Environment Variables**:
   ```bash
   npx vercel env add GOOGLE_CLIENT_ID
   npx vercel env add GEMINI_API_KEY
   npx vercel env add GEMINI_MODEL
   npx vercel env add AI_PARSE_MODE
   ```
   
   For each variable, select:
   - **Production**, **Preview**, and **Development** environments
   - Enter the value when prompted

5. **Redeploy with environment variables**:
   ```bash
   npm run vercel:prod
   ```
   
   Or use npx:
   ```bash
   npx vercel --prod
   ```

### Option 2: Deploy via Vercel Dashboard

1. **Push your code to GitHub** (if not already):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-github-repo-url>
   git push -u origin main
   ```

2. **Import project in Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Click "Import Git Repository"
   - Select your GitHub repository
   - Click "Import"

3. **Configure project**:
   - Framework Preset: **Vite**
   - Root Directory: **./**
   - Build Command: `npm run build` (should be auto-detected)
   - Output Directory: `dist` (should be auto-detected)
   - Install Command: `npm install` (should be auto-detected)

4. **Add Environment Variables**:
   - Go to Project Settings → Environment Variables
   - Add each variable:
     - `GOOGLE_CLIENT_ID`
     - `GEMINI_API_KEY`
     - `GEMINI_MODEL` (optional)
     - `AI_PARSE_MODE` (optional)
   - Select all environments (Production, Preview, Development)
   - Click "Save"

5. **Deploy**:
   - Click "Deploy"
   - Wait for the build to complete
   - Your app will be live at `https://your-project.vercel.app`

## Project Structure

The deployment uses:
- **Frontend**: Built with Vite, served as static files from `/dist`
- **Backend API**: Serverless functions in `/api` directory:
  - `/api/config.js` - Returns configuration to frontend
  - `/api/gemini.js` - Proxies requests to Gemini API

## Environment Variables

Make sure to set these in Vercel:

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_CLIENT_ID` | Yes | Your Google OAuth Client ID |
| `GEMINI_API_KEY` | Yes | Your Google Gemini API key |
| `GEMINI_MODEL` | No | Gemini model to use (default: `gemini-2.0-flash`) |
| `AI_PARSE_MODE` | No | Force local parsing mode if set |

## Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Ensure TypeScript compiles without errors: `npm run build`

### API Endpoints Not Working
- Verify environment variables are set in Vercel dashboard
- Check Vercel function logs in the dashboard
- Ensure CORS headers are properly set (already configured in the functions)

### Frontend Can't Connect to API
- The frontend automatically uses relative URLs on Vercel
- If you need a custom backend URL, set `VITE_BACKEND_URL` in Vercel environment variables

## Local Development

To test locally with the same setup as Vercel:

1. **Install dependencies** (Vercel CLI is included):
   ```bash
   npm install
   ```

2. **Run Vercel dev server**:
   ```bash
   npm run vercel:dev
   ```
   
   Or use npx:
   ```bash
   npx vercel dev
   ```

   This will:
   - Start the frontend dev server
   - Run serverless functions locally
   - Load environment variables from `.env` file

## Custom Domain

To add a custom domain:
1. Go to your project in Vercel dashboard
2. Navigate to Settings → Domains
3. Add your domain
4. Follow DNS configuration instructions

## Continuous Deployment

Once connected to GitHub, Vercel will automatically deploy:
- **Production**: On push to `main` branch
- **Preview**: On push to other branches or pull requests

