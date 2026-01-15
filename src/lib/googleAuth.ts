// Google OAuth and Calendar API client-side integration
// Modern OAuth 2.0 Authorization Code + PKCE flow with httpOnly cookies

declare global {
  interface Window {
    google: any;
  }
}

export interface GoogleUser {
  name: string;
  email: string;
  accessToken: string;
}

let codeClient: any = null;
let onSuccessCallback: ((user: GoogleUser) => void) | null = null;
let onErrorCallback: ((error: string) => void) | null = null;

// Get backend URL
function getBackendUrl(): string {
  // If VITE_BACKEND_URL is explicitly set, use it
  if (import.meta.env.VITE_BACKEND_URL) {
    return import.meta.env.VITE_BACKEND_URL;
  }
  
  // For Vercel dev/prod: use relative URLs (API routes on same origin)
  // For Vite dev with Express server: use localhost:3001
  // Check if we're likely running Vercel dev (API routes available on same origin)
  // or Vite dev (needs separate Express server on 3001)
  if (import.meta.env.DEV) {
    // Try to detect if we're in Vercel dev mode
    // Vercel dev serves API on same origin, so relative URL works
    // Vite dev needs Express server on 3001
    // Default to relative URL (works for Vercel), fallback to 3001 if needed
    return ''; // Use relative URLs for Vercel dev
  }
  
  // Production: use relative URLs
  return '';
}

// Get PKCE challenge from backend
async function getPKCEChallenge(): Promise<{ codeChallenge: string; codeChallengeMethod: string }> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/api/auth/pkce`, {
    method: 'GET',
    credentials: 'include', // Important for cookies
  });
  
  if (!response.ok) {
    throw new Error('Failed to get PKCE challenge');
  }
  
  return response.json();
}

// Get access token from backend (reads from httpOnly cookie)
async function getAccessTokenFromBackend(): Promise<string | null> {
  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/auth/user`, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (response.ok) {
      // Token is valid, but we need to get it for API calls
      // Since it's in httpOnly cookie, we'll need to proxy API calls through backend
      // For now, we'll return a marker that token exists
      return 'cookie'; // Marker that token exists in cookie
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get access token from backend:', error);
    return null;
  }
}

export function initializeGoogleAuth(
  clientId: string,
  onSuccess: (user: GoogleUser) => void,
  onError: (error: string) => void
) {
  onSuccessCallback = onSuccess;
  onErrorCallback = onError;

  if (!window.google) {
    const error = 'Google Identity Services library not loaded';
    console.error(error);
    onError(error);
    return;
  }

  if (!window.google.accounts?.oauth2) {
    const error = 'Google OAuth2 API not available';
    console.error(error);
    onError(error);
    return;
  }

  try {
    // For popup mode, redirect_uri should be the current page origin
    // The callback will receive the code and we'll send it to backend
    const redirectUri = window.location.origin;
    
    // Initialize the code client (Authorization Code + PKCE)
    codeClient = window.google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      ux_mode: 'popup',
      redirect_uri: redirectUri, // Current page origin for popup mode
      callback: async (response: any) => {
        if (response.error) {
          const errorMsg = response.error_description || response.error || 'Unknown error';
          console.error('Authorization error:', {
            error: response.error,
            error_description: response.error_description,
            redirect_uri: redirectUri,
            full_response: response
          });
          
          // Provide more helpful error messages
          if (response.error === 'access_denied') {
            onErrorCallback?.('Sign-in was cancelled or denied. Please try again and grant the requested permissions.');
          } else {
            onErrorCallback?.(errorMsg);
          }
          return;
        }
        
        if (!response.code) {
          const errorMsg = 'No authorization code received';
          console.error(errorMsg);
          onErrorCallback?.(errorMsg);
          return;
        }
        
        try {
          // Exchange authorization code for tokens (via backend)
          // Pass the redirect_uri to ensure it matches what Google received
          const backendUrl = getBackendUrl();
          const tokenResponse = await fetch(`${backendUrl}/api/auth/callback`, {
            method: 'POST',
            credentials: 'include', // Important for cookies
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code: response.code,
              redirect_uri: redirectUri, // Pass the exact redirect URI used
            }),
          });
          
          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            let error;
            try {
              error = JSON.parse(errorText);
            } catch {
              error = { error: errorText };
            }
            
            console.error('Token exchange failed:', {
              status: tokenResponse.status,
              statusText: tokenResponse.statusText,
              error: error,
              redirectUri: redirectUri,
              backendUrl: backendUrl
            });
            
            const errorMsg = error.error || error.details || error.error_description || 'Failed to exchange authorization code';
            throw new Error(errorMsg);
          }
          
          const result = await tokenResponse.json();
          
          // Get user info (token is now in httpOnly cookie)
          const user: GoogleUser = {
            name: result.user.name,
            email: result.user.email,
            accessToken: 'cookie', // Token is in httpOnly cookie, not accessible to JS
          };
          
          onSuccessCallback?.(user);
        } catch (err: any) {
          console.error('Error exchanging authorization code:', err);
          onErrorCallback?.(err.message || 'Failed to complete sign-in');
        }
      },
    });
    console.log('Google Auth initialized successfully (Code Client with PKCE)');
  } catch (error: any) {
    const errorMsg = error?.message || 'Failed to initialize code client';
    console.error('Failed to initialize Google Auth:', errorMsg, error);
    onError(errorMsg);
  }
}

export async function signIn(): Promise<void> {
  if (!window.google?.accounts?.oauth2) {
    const error = 'Google Identity Services not loaded. Please refresh the page.';
    console.error(error);
    onErrorCallback?.(error);
    throw new Error(error);
  }
  
  if (!codeClient) {
    const error = 'Google Auth not initialized. Please check your configuration.';
    console.error(error);
    onErrorCallback?.(error);
    throw new Error(error);
  }
  
  try {
    // Get PKCE challenge from backend
    const { codeChallenge, codeChallengeMethod } = await getPKCEChallenge();
    
    // Get current origin for redirect URI (for logging)
    const redirectUri = window.location.origin;
    console.log('Initiating sign-in with:', {
      redirect_uri: redirectUri,
      code_challenge_method: codeChallengeMethod
    });
    
    // Request authorization code with PKCE
    codeClient.requestCode({
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
    });
  } catch (error: any) {
    const errorMsg = error?.message || 'Failed to initiate sign-in';
    console.error('Sign-in error:', errorMsg, error);
    onErrorCallback?.(errorMsg);
    throw error;
  }
}

export async function signOut(): Promise<void> {
  try {
    const backendUrl = getBackendUrl();
    await fetch(`${backendUrl}/api/auth/signout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch (error) {
    console.error('Sign out error:', error);
  } finally {
    // Cleanup handled by callbacks
  }
}

export async function getAccessToken(): Promise<string | null> {
  // Token is in httpOnly cookie, so we return a marker
  // For direct Google API calls, we'll need to proxy through backend
  const token = await getAccessTokenFromBackend();
  return token;
}

// Restore saved session from backend (checks httpOnly cookie)
export async function restoreSession(): Promise<GoogleUser | null> {
  try {
    const backendUrl = getBackendUrl();
    const response = await fetch(`${backendUrl}/api/auth/user`, {
      method: 'GET',
      credentials: 'include',
    });
    
    if (response.ok) {
      const result = await response.json();
      const user: GoogleUser = {
        name: result.user.name,
        email: result.user.email,
        accessToken: 'cookie', // Token is in httpOnly cookie
      };
      return user;
    } else {
      // Not authenticated
      return null;
    }
  } catch (error) {
    console.error('Failed to restore session:', error);
    return null;
  }
}

// Check if an error response indicates an expired/invalid token
function isTokenError(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

// Handle token errors by clearing the session
async function handleTokenError(): Promise<void> {
  console.log('Token expired or invalid, clearing session');
  await signOut();
  if (onErrorCallback) {
    onErrorCallback('Your session has expired. Please sign in again.');
  }
}

// Proxy Google Calendar API call through backend
async function proxyGoogleAPI(url: string, options: RequestInit = {}): Promise<Response> {
  const backendUrl = getBackendUrl();
  return fetch(`${backendUrl}/api/google-proxy`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body,
    }),
  });
}

// Get or create SnapPlan calendar
export async function getOrCreateSnapPlanCalendar(): Promise<string> {
  // Proxy through backend since token is in httpOnly cookie
  const listResponse = await proxyGoogleAPI(
    'https://www.googleapis.com/calendar/v3/users/me/calendarList',
    { method: 'GET' }
  );

  if (isTokenError(listResponse)) {
    await handleTokenError();
    throw new Error('Authentication expired. Please sign in again.');
  }

  if (listResponse.ok) {
    const calendars = await listResponse.json();
    const snapPlanCalendar = calendars.items?.find((cal: any) => 
      cal.summary === 'SnapPlan' || cal.summary === 'Snapplan'
    );
    
    if (snapPlanCalendar) {
      return snapPlanCalendar.id;
    }
  }

  // If not found, create a new SnapPlan calendar
  const createResponse = await proxyGoogleAPI(
    'https://www.googleapis.com/calendar/v3/calendars',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: 'SnapPlan',
        description: 'Events created by SnapPlan',
        timeZone: 'America/New_York',
      }),
    }
  );

  if (isTokenError(createResponse)) {
    await handleTokenError();
    throw new Error('Authentication expired. Please sign in again.');
  }

  if (!createResponse.ok) {
    const error = await createResponse.json().catch(() => ({}));
    throw new Error(error.error?.message || `Failed to create SnapPlan calendar: ${createResponse.statusText}`);
  }

  const newCalendar = await createResponse.json();
  return newCalendar.id;
}

export async function createCalendarEvent(event: {
  title: string;
  description?: string;
  location?: string;
  startISO: string;
  endISO: string;
  allDay?: boolean;
}): Promise<void> {
  // Get or create SnapPlan calendar
  const calendarId = await getOrCreateSnapPlanCalendar();

  // For all-day events, use date format (YYYY-MM-DD) instead of dateTime
  if (event.allDay) {
    const startDate = new Date(event.startISO);
    const endDate = new Date(event.endISO);
    
    // Format as YYYY-MM-DD
    const startDateStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`;
    // For all-day events, end date should be the next day
    const endDateObj = new Date(endDate);
    endDateObj.setDate(endDateObj.getDate() + 1);
    const endDateStr = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`;
    
    const response = await proxyGoogleAPI(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          summary: event.title,
          description: event.description,
          location: event.location,
          start: {
            date: startDateStr,
          },
          end: {
            date: endDateStr,
          },
        }),
      }
    );

    if (isTokenError(response)) {
      await handleTokenError();
      throw new Error('Authentication expired. Please sign in again.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Failed to create event: ${response.statusText}`);
    }
    return;
  }

  // For timed events, use dateTime format
  const response = await proxyGoogleAPI(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.description,
        location: event.location,
        start: {
          dateTime: event.startISO,
        },
        end: {
          dateTime: event.endISO,
        },
      }),
    }
  );

  if (isTokenError(response)) {
    await handleTokenError();
    throw new Error('Authentication expired. Please sign in again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Failed to create event: ${response.statusText}`);
  }
}
