// Google OAuth and Calendar API client-side integration

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

const STORAGE_KEY = 'snapplan_auth';

let tokenClient: any = null;
let accessToken: string | null = null;
let onSuccessCallback: ((user: GoogleUser) => void) | null = null;
let onErrorCallback: ((error: string) => void) | null = null;

// Load saved auth from localStorage
function loadSavedAuth(): { user: GoogleUser; token: string } | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.user && parsed.token) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Failed to load saved auth:', error);
  }
  return null;
}

// Save auth to localStorage
function saveAuth(user: GoogleUser, token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ user, token }));
  } catch (error) {
    console.error('Failed to save auth:', error);
  }
}

// Clear saved auth from localStorage
function clearSavedAuth(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear saved auth:', error);
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
    // Initialize the token client
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      callback: async (tokenResponse: any) => {
        if (tokenResponse.error) {
          const errorMsg = tokenResponse.error_description || tokenResponse.error || 'Unknown error';
          console.error('Token response error:', errorMsg);
          onErrorCallback?.(errorMsg);
          return;
        }
        
        if (!tokenResponse.access_token) {
          const errorMsg = 'No access token received';
          console.error(errorMsg);
          onErrorCallback?.(errorMsg);
          return;
        }
        
        accessToken = tokenResponse.access_token;
        
        try {
          // Get user info
          const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
          });
          
          if (!userInfoResponse.ok) {
            const errorText = await userInfoResponse.text();
            console.error('User info response error:', userInfoResponse.status, errorText);
            throw new Error(`Failed to fetch user info: ${userInfoResponse.status} ${userInfoResponse.statusText}`);
          }
          
          const userInfo = await userInfoResponse.json();
          const user: GoogleUser = {
            name: userInfo.name || userInfo.email,
            email: userInfo.email,
            accessToken: accessToken!,
          };
          
          // Save to localStorage for persistence
          saveAuth(user, accessToken!);
          
          onSuccessCallback?.(user);
        } catch (err: any) {
          console.error('Error fetching user info:', err);
          onErrorCallback?.(err.message || 'Failed to get user info');
        }
      },
    });
    console.log('Google Auth initialized successfully');
  } catch (error: any) {
    const errorMsg = error?.message || 'Failed to initialize token client';
    console.error('Failed to initialize Google Auth:', errorMsg, error);
    onError(errorMsg);
  }
}

export function signIn(): void {
  if (!window.google?.accounts?.oauth2) {
    const error = 'Google Identity Services not loaded. Please refresh the page.';
    console.error(error);
    onErrorCallback?.(error);
    throw new Error(error);
  }
  
  if (!tokenClient) {
    const error = 'Google Auth not initialized. Please check your VITE_GOOGLE_CLIENT_ID environment variable.';
    console.error(error);
    onErrorCallback?.(error);
    throw new Error(error);
  }
  
  try {
    // Use 'select_account' to allow silent re-authentication if user is already logged in
    tokenClient.requestAccessToken({ prompt: 'select_account' });
  } catch (error: any) {
    const errorMsg = error?.message || 'Failed to request access token';
    console.error('Sign-in error:', errorMsg, error);
    onErrorCallback?.(errorMsg);
    throw error;
  }
}

export function signOut(): void {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken, () => {
      accessToken = null;
      clearSavedAuth();
    });
  } else {
    clearSavedAuth();
  }
  accessToken = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

// Restore saved session from localStorage
export async function restoreSession(): Promise<GoogleUser | null> {
  const saved = loadSavedAuth();
  if (!saved) {
    return null;
  }

  // Verify the token is still valid by making a test API call
  try {
    const testResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${saved.token}`,
      },
    });

    if (testResponse.ok) {
      // Token is valid, restore the session
      accessToken = saved.token;
      return saved.user;
    } else {
      // Token is invalid or expired, clear saved auth
      console.log('Saved token is invalid or expired, clearing saved session');
      clearSavedAuth();
      return null;
    }
  } catch (error) {
    console.error('Failed to verify saved session:', error);
    clearSavedAuth();
    return null;
  }
}

// Check if an error response indicates an expired/invalid token
function isTokenError(response: Response): boolean {
  return response.status === 401 || response.status === 403;
}

// Handle token errors by clearing the session
function handleTokenError(): void {
  console.log('Token expired or invalid, clearing session');
  accessToken = null;
  clearSavedAuth();
  if (onErrorCallback) {
    onErrorCallback('Your session has expired. Please sign in again.');
  }
}

// Get or create SnapPlan calendar
export async function getOrCreateSnapPlanCalendar(): Promise<string> {
  const token = getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

  // First, try to find existing SnapPlan calendar
  const listResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (isTokenError(listResponse)) {
    handleTokenError();
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
  const createResponse = await fetch('https://www.googleapis.com/calendar/v3/calendars', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      summary: 'SnapPlan',
      description: 'Events created by SnapPlan',
      timeZone: 'America/New_York',
    }),
  });

  if (isTokenError(createResponse)) {
    handleTokenError();
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
  const token = getAccessToken();
  if (!token) {
    throw new Error('Not authenticated');
  }

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
    
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
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
    });

    if (isTokenError(response)) {
      handleTokenError();
      throw new Error('Authentication expired. Please sign in again.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error?.message || `Failed to create event: ${response.statusText}`);
    }
    return;
  }

  // For timed events, use dateTime format
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
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
  });

  if (isTokenError(response)) {
    handleTokenError();
    throw new Error('Authentication expired. Please sign in again.');
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Failed to create event: ${response.statusText}`);
  }
}

