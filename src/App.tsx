import { useEffect, useRef, useState } from 'react';
import CameraCapture from './components/CameraCapture';
import { parseWithAI, type ParsedEvent, type ParseResult } from './lib/parseWithAI';
import { toIcs } from './lib/ics';
import { initializeGoogleAuth, signIn, signOut, createCalendarEvent, getAccessToken, type GoogleUser } from './lib/googleAuth';
import Tesseract from 'tesseract.js';

export default function App() {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [extractedText, setExtractedText] = useState('');
  const [parsing, setParsing] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [events, setEvents] = useState<ParsedEvent[] | null>(null);
  const [ics, setIcs] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Effect to initialize Google Auth
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    console.log('Checking for VITE_GOOGLE_CLIENT_ID...', clientId ? 'Found' : 'NOT FOUND');
    
    if (!clientId) {
      const errorMsg = 'VITE_GOOGLE_CLIENT_ID is not set in environment variables. Please check your .env file.';
      setAuthError(errorMsg);
      console.error(errorMsg);
      console.error('To fix: Create a .env file in the project root with VITE_GOOGLE_CLIENT_ID=your-client-id');
      return;
    }

    console.log('Google Client ID found, waiting for Google Identity Services to load...');

    let retryCount = 0;
    const maxRetries = 50; // Try for up to 5 seconds (50 * 100ms)

    // Wait for Google Identity Services to load
    const checkGoogle = () => {
      if (window.google?.accounts?.oauth2) {
        console.log('Google Identity Services loaded, initializing auth...');
        try {
          initializeGoogleAuth(
            clientId,
            (user) => {
              console.log('Google Auth success:', user.email);
              setUser(user);
              setAuthReady(true);
              setSigningIn(false);
            },
            (error) => {
              console.error('Google Auth Error:', error);
              setAuthError('Google sign-in failed: ' + error);
              setSigningIn(false);
              alert('Google sign-in failed: ' + error);
            }
          );
          setAuthReady(true);
          console.log('Google Auth initialized successfully');
        } catch (error: any) {
          console.error('Failed to initialize Google Auth:', error);
          setAuthError('Failed to initialize Google Auth: ' + (error?.message || 'Unknown error'));
        }
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          if (retryCount % 10 === 0) {
            console.log(`Waiting for Google Identity Services... (${retryCount * 100}ms)`);
          }
          setTimeout(checkGoogle, 100);
        } else {
          const errorMsg = 'Google Identity Services script failed to load after 5 seconds. Please check your internet connection and refresh the page.';
          setAuthError(errorMsg);
          console.error('Google Identity Services script did not load after 5 seconds');
          console.error('Check if the script tag is in index.html and if you have internet connection');
        }
      }
    };

    // Start checking after a brief delay to allow script to load
    const timeoutId = setTimeout(checkGoogle, 500);

    return () => clearTimeout(timeoutId);
  }, []);

  const handleImage = async (blob: Blob) => {
    setOcrLoading(true);
    try {
      // Convert blob to data URL for OCR
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });

      // Run OCR client-side
      const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng');
      setExtractedText(text || '');
      
      // Automatically parse if text was extracted
      if (text) {
        await parseText(text);
      }
    } catch (error: any) {
      alert('OCR failed: ' + (error?.message || 'Unknown error'));
    } finally {
      setOcrLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleImage(file);
  };

  const parseText = async (text?: string) => {
    const textToParse = text || extractedText;
    if (!textToParse) return;

    setParsing(true);
    setParseResult(null);
    try {
      const result = await parseWithAI(textToParse);
      setParseResult(result);
      setEvents(result.events);
      
      // Log the parsing method used
      console.log(`Parsing method: ${result.method}`, result.method === 'gemini' ? `(Model: ${result.model})` : `(Reason: ${result.reason})`);
      
      // Generate ICS
      try {
        const icsContent = toIcs(result.events);
        setIcs(icsContent);
      } catch (err) {
        console.error('ICS generation failed:', err);
        setIcs(null);
      }
    } catch (error: any) {
      alert('Parsing failed: ' + (error?.message || 'Unknown error'));
    } finally {
      setParsing(false);
    }
  };

  const createEvents = async () => {
    if (!events || events.length === 0) return;
    if (!getAccessToken()) {
      alert('Please sign in first');
      return;
    }

    setCreating(true);
    try {
      for (const event of events) {
        await createCalendarEvent(event);
      }
      alert(`Successfully created ${events.length} event(s) in Google Calendar!`);
    } catch (error: any) {
      alert('Failed to create events: ' + (error?.message || 'Unknown error'));
    } finally {
      setCreating(false);
    }
  };

  const downloadIcs = () => {
    if (!ics) return;
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'snapplan-events.ics';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'Inter, system-ui, Arial' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1>SnapPlan</h1>
        <div>
          {user ? (
            <>
              <span style={{ marginRight: 12 }}>Hi, {user.name || user.email}</span>
              <button onClick={() => { signOut(); setUser(null); }}>
                Sign out
              </button>
            </>
          ) : (
            <div>
              <button 
                onClick={() => {
                  setSigningIn(true);
                  setAuthError(null);
                  try {
                    signIn();
                  } catch (error: any) {
                    setSigningIn(false);
                    const errorMsg = error?.message || 'Failed to initiate sign-in';
                    setAuthError(errorMsg);
                    alert('Sign-in error: ' + errorMsg);
                  }
                }}
                disabled={!authReady || signingIn}
                style={{ opacity: (!authReady || signingIn) ? 0.6 : 1 }}
              >
                {signingIn ? 'Signing in...' : 'Sign in with Google'}
              </button>
              {authError && (
                <div style={{ marginTop: 8, padding: '8px', background: '#ffe6e6', border: '1px solid #ff9999', borderRadius: '4px', fontSize: '12px', maxWidth: 400 }}>
                  <div style={{ color: 'red', fontWeight: 'bold', marginBottom: '4px' }}>Error:</div>
                  <div style={{ color: '#cc0000' }}>{authError}</div>
                  {authError.includes('VITE_GOOGLE_CLIENT_ID') && (
                    <div style={{ marginTop: '8px', color: '#666', fontSize: '11px' }}>
                      <strong>To fix:</strong> Create a <code>.env</code> file in the project root with:<br/>
                      <code>VITE_GOOGLE_CLIENT_ID=your-client-id</code><br/>
                      Then restart the dev server.
                    </div>
                  )}
                </div>
              )}
              {!authReady && !authError && (
                <div style={{ marginTop: 8, color: '#666', fontSize: '12px' }}>
                  Loading Google sign-in...
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main>
        <section style={{ marginBottom: 32 }}>
          <h2>1) Capture a photo (or upload)</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16 }}>
            <CameraCapture onCapture={handleImage} />
            <div>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} />
            </div>
          </div>
          {ocrLoading && <div style={{ marginTop: 8, color: '#666' }}>Extracting text from image...</div>}
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>2) Extracted text</h2>
          <textarea
            value={extractedText}
            onChange={(e) => {
              setExtractedText(e.target.value);
              // Clear parse result when text changes
              if (parseResult) setParseResult(null);
            }}
            placeholder="Extracted text from photo will appear here..."
            rows={8}
            style={{ width: '100%', fontFamily: 'monospace', padding: '8px' }}
          />
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => parseText()} disabled={!extractedText || parsing}>
              {parsing ? 'Parsing…' : 'Parse with AI'}
            </button>
            {!parsing && extractedText && (
              <div style={{ fontSize: '12px', color: '#666' }}>
                {import.meta.env.VITE_GEMINI_API_KEY ? (
                  <span>Will use: <strong>Gemini AI</strong> ({import.meta.env.VITE_GEMINI_MODEL || 'gemini-1.5-flash'})</span>
                ) : (
                  <span>Will use: <strong>Fallback Heuristic</strong> (Gemini API key not set)</span>
                )}
              </div>
            )}
          </div>
        </section>

        {events && (
          <section style={{ marginBottom: 32 }}>
            <h2>3) Parsed events preview</h2>
            {parseResult && (
              <div
                style={{
                  marginBottom: 16,
                  padding: '12px',
                  borderRadius: '6px',
                  border: `2px solid ${parseResult.method === 'gemini' ? '#34a853' : '#fbbc04'}`,
                  background: parseResult.method === 'gemini' ? '#e8f5e9' : '#fff8e1',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <strong style={{ color: parseResult.method === 'gemini' ? '#1e7e34' : '#f57c00' }}>
                    {parseResult.method === 'gemini' ? '✅ Using Gemini AI' : '⚠️ Using Fallback Heuristic'}
                  </strong>
                  {parseResult.method === 'gemini' && parseResult.model && (
                    <span style={{ fontSize: '12px', color: '#666' }}>({parseResult.model})</span>
                  )}
                </div>
                {parseResult.method === 'fallback' && parseResult.reason && (
                  <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                    <strong>Reason:</strong> {parseResult.reason}
                  </div>
                )}
                {parseResult.method === 'gemini' && (
                  <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                    Events successfully parsed using Google Gemini AI
                  </div>
                )}
              </div>
            )}
            <ul>
              {events.map((ev, idx) => (
                <li key={idx} style={{ marginBottom: 12, padding: '12px', background: 'white', borderRadius: '4px', border: '1px solid #ddd' }}>
                  <div><strong>{ev.title}</strong></div>
                  <div style={{ marginTop: 4, color: '#666' }}>
                    {new Date(ev.startISO).toLocaleString()} → {new Date(ev.endISO).toLocaleString()}
                  </div>
                  {ev.location && <div style={{ marginTop: 4 }}>📍 {ev.location}</div>}
                  {ev.description && <div style={{ marginTop: 4, color: '#666' }}>{ev.description}</div>}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 16 }}>
              <button onClick={createEvents} disabled={creating || !user}>
                {creating ? 'Creating…' : 'Create in Google Calendar'}
              </button>
              {!user && <span style={{ marginLeft: 8, color: '#666' }}>Sign in first</span>}
              {ics && (
                <>
                  <button onClick={downloadIcs} style={{ marginLeft: 8 }}>
                    Download .ics (optional)
                  </button>
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: 'pointer', color: '#666' }}>Show ICS preview (optional)</summary>
                    <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '8px', borderRadius: '4px', marginTop: '8px', fontSize: '12px' }}>{ics}</pre>
                  </details>
                </>
              )}
            </div>
          </section>
        )}
      </main>

      <footer style={{ marginTop: 48, color: '#666', fontSize: '14px' }}>
        <small>Note: This is a client-side application. API keys are loaded from environment variables.</small>
      </footer>
    </div>
  );
}

