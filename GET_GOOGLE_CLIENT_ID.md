# How to Get Your Google OAuth Client ID

## Step-by-Step Instructions

### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Sign in with your Google account

### Step 2: Create or Select a Project
1. Click the project dropdown at the top (next to "Google Cloud")
2. Either:
   - Click "New Project" to create a new project
   - Or select an existing project
3. Give your project a name (e.g., "SnapPlan")
4. Click "Create" (if creating new)

### Step 3: Enable Google Calendar API
1. In the left sidebar, go to **"APIs & Services"** > **"Library"**
2. In the search box, type: **"Google Calendar API"**
3. Click on **"Google Calendar API"** from the results
4. Click the **"Enable"** button
5. Wait for it to enable (takes a few seconds)

### Step 4: Create OAuth Consent Screen (First Time Only)
1. Go to **"APIs & Services"** > **"OAuth consent screen"**
2. Select **"External"** (unless you have a Google Workspace)
3. Click **"Create"**
4. Fill in the required fields:
   - **App name**: SnapPlan (or any name)
   - **User support email**: Your email
   - **Developer contact information**: Your email
5. Click **"Save and Continue"**
6. On "Scopes" page, click **"Save and Continue"** (we'll add scopes later)
7. On "Test users" page, click **"Save and Continue"** (or add test users if needed)
8. Click **"Back to Dashboard"**

### Step 5: Create OAuth 2.0 Credentials
1. Go to **"APIs & Services"** > **"Credentials"**
2. Click **"+ CREATE CREDENTIALS"** at the top
3. Select **"OAuth client ID"**
4. If prompted about OAuth consent screen, click **"Configure Consent Screen"** and complete Step 4 above
5. For "Application type", select **"Web application"**
6. Give it a name (e.g., "SnapPlan Web Client")
7. Under **"Authorized JavaScript origins"**, click **"+ ADD URI"**
8. Add: `http://localhost:3000`
9. (Optional) Under **"Authorized redirect URIs"**, you can add: `http://localhost:3000`
10. Click **"Create"**

### Step 6: Copy Your Client ID
1. A popup will appear showing your **Client ID** and **Client secret**
2. **Copy the Client ID** (it looks like: `123456789-abcdefghijklmnop.apps.googleusercontent.com`)
3. **Important**: You only need the Client ID, not the Client secret
4. Click **"OK"**

### Step 7: Add to Your .env File
1. Open or create `.env` file in your project root (`/Users/shepherd/snapplan/.env`)
2. Add this line:
   ```env
   VITE_GOOGLE_CLIENT_ID=your-client-id-here.apps.googleusercontent.com
   ```
3. Replace `your-client-id-here.apps.googleusercontent.com` with the Client ID you copied
4. Save the file

### Step 8: Restart Your Dev Server
1. Stop your current dev server (Ctrl+C in terminal)
2. Start it again:
   ```bash
   npm run dev
   ```

## Example .env File
```env
VITE_GOOGLE_CLIENT_ID=123456789-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com
VITE_GEMINI_API_KEY=your-gemini-api-key-here
VITE_GEMINI_MODEL=gemini-1.5-flash
```

## What the Client ID Looks Like
- Format: `numbers-letters.apps.googleusercontent.com`
- Example: `123456789012-abcdefghijklmnopqrstuvwxyz123456.apps.googleusercontent.com`
- Length: Usually around 60-80 characters
- Always ends with: `.apps.googleusercontent.com`

## Troubleshooting

### "Redirect URI mismatch" Error
- Make sure `http://localhost:3000` is added to "Authorized JavaScript origins"
- Check that there are no trailing slashes
- Make sure you're using `http://` not `https://` for localhost

### "OAuth client not found" Error
- Double-check that you copied the entire Client ID
- Make sure there are no extra spaces
- Verify the Client ID in Google Cloud Console

### Still Not Working?
1. Check browser console (F12) for error messages
2. Verify the `.env` file is in the project root
3. Make sure you restarted the dev server after adding the Client ID
4. Check that the variable name is exactly: `VITE_GOOGLE_CLIENT_ID` (with VITE_ prefix)

## Quick Checklist
- [ ] Created/selected a Google Cloud project
- [ ] Enabled Google Calendar API
- [ ] Created OAuth consent screen
- [ ] Created OAuth 2.0 credentials (Web application)
- [ ] Added `http://localhost:3000` to authorized origins
- [ ] Copied the Client ID
- [ ] Added `VITE_GOOGLE_CLIENT_ID=...` to `.env` file
- [ ] Restarted the dev server

## Need Help?
If you're stuck, check:
- Google Cloud Console: https://console.cloud.google.com/
- Google OAuth Documentation: https://developers.google.com/identity/protocols/oauth2

