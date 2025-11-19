import { useEffect, useRef, useState } from 'react';
import CameraCapture from './components/CameraCapture';
import EventEditModal from './components/EventEditModal';
import { parseWithAI, type ParsedEvent, type ParseResult } from './lib/parseWithAI';
import { toIcs } from './lib/ics';
import { initializeGoogleAuth, signIn, signOut, createCalendarEvent, getAccessToken, type GoogleUser } from './lib/googleAuth';

export default function App() {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [inputText, setInputText] = useState('');
  const [inputMethod, setInputMethod] = useState<'text' | 'camera' | 'upload'>('text');
  const [parsing, setParsing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [events, setEvents] = useState<ParsedEvent[] | null>(null);
  const [ics, setIcs] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [selectedImage, setSelectedImage] = useState<Blob | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [editingEventIndex, setEditingEventIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Effect to fetch config from backend and initialize Google Auth
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
        const response = await fetch(`${backendUrl}/api/config`);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch config: ${response.status}`);
        }
        
        const config = await response.json();
        const clientId = config.googleClientId;
        
        console.log('Config fetched from backend:', { 
          hasClientId: !!clientId,
          model: config.geminiModel,
          parseMode: config.aiParseMode 
        });
        
        if (!clientId) {
          const errorMsg = 'Google Client ID not found in backend config. Please check your .env file on the server.';
          setAuthError(errorMsg);
          console.error(errorMsg);
          console.error('To fix: Add GOOGLE_CLIENT_ID=your-client-id to your .env file');
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
        setTimeout(checkGoogle, 500);
      } catch (error: any) {
        const errorMsg = `Failed to fetch config from backend: ${error.message}`;
        setAuthError(errorMsg);
        console.error(errorMsg);
        console.error('Make sure the backend server is running on http://localhost:3001');
      }
    };

    fetchConfig();
  }, []);

  // Cleanup image preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  const handleImageCapture = async (blob: Blob) => {
    setSelectedImage(blob);
    setInputMethod('camera');
    // Create preview
    const url = URL.createObjectURL(blob);
    setImagePreview(url);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    setInputMethod('upload');
    // Create preview
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  };

  const handleParse = async () => {
    if (inputMethod === 'text' && !inputText.trim()) {
      alert('Please enter some text to parse');
      return;
    }
    if ((inputMethod === 'camera' || inputMethod === 'upload') && !selectedImage) {
      alert('Please capture or upload an image');
      return;
    }

    setParsing(true);
    setParseResult(null);
    setEvents(null);
    setIcs(null);
    setEditingEventIndex(null);
    
    try {
      // Send text or image directly to AI
      const input = inputMethod === 'text' ? inputText : selectedImage!;
      const result = await parseWithAI(input);
      setParseResult(result);
      setEvents(result.events);
      
      // Log the parsing method used
      console.log(`Parsing method: ${result.method}`, result.method === 'gemini' ? `(Model: ${result.model})` : `(Reason: ${result.reason})`);
      
      // Automatically open first event for editing
      if (result.events.length > 0) {
        setEditingEventIndex(0);
      }
      
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

  const handleEventSave = (updatedEvent: ParsedEvent) => {
    if (editingEventIndex === null || !events) return;
    
    const updatedEvents = [...events];
    updatedEvents[editingEventIndex] = updatedEvent;
    setEvents(updatedEvents);
    
    // Regenerate ICS with updated events
    try {
      const icsContent = toIcs(updatedEvents);
      setIcs(icsContent);
    } catch (err) {
      console.error('ICS generation failed:', err);
      setIcs(null);
    }
    
    // Move to next event or close if last
    if (editingEventIndex < events.length - 1) {
      setEditingEventIndex(editingEventIndex + 1);
    } else {
      setEditingEventIndex(null);
    }
  };

  const clearInput = () => {
    setInputText('');
    setSelectedImage(null);
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImagePreview(null);
    setEvents(null);
    setParseResult(null);
    setIcs(null);
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
          <h2>1) Input Method</h2>
          
          {/* Input Method Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, borderBottom: '2px solid #ddd' }}>
            <button
              onClick={() => {
                setInputMethod('text');
                clearInput();
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: inputMethod === 'text' ? '#4285f4' : 'transparent',
                color: inputMethod === 'text' ? 'white' : '#666',
                cursor: 'pointer',
                borderBottom: inputMethod === 'text' ? '2px solid #4285f4' : '2px solid transparent',
                marginBottom: '-2px',
              }}
            >
              📝 Paste Text
            </button>
            <button
              onClick={() => {
                setInputMethod('camera');
                clearInput();
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: inputMethod === 'camera' ? '#4285f4' : 'transparent',
                color: inputMethod === 'camera' ? 'white' : '#666',
                cursor: 'pointer',
                borderBottom: inputMethod === 'camera' ? '2px solid #4285f4' : '2px solid transparent',
                marginBottom: '-2px',
              }}
            >
              📷 Camera
            </button>
            <button
              onClick={() => {
                setInputMethod('upload');
                if (inputMethod !== 'upload') {
                  clearInput();
                }
                // Trigger file input click after a small delay to ensure state is updated
                setTimeout(() => {
                  fileInputRef.current?.click();
                }, 0);
              }}
              style={{
                padding: '8px 16px',
                border: 'none',
                background: inputMethod === 'upload' ? '#4285f4' : 'transparent',
                color: inputMethod === 'upload' ? 'white' : '#666',
                cursor: 'pointer',
                borderBottom: inputMethod === 'upload' ? '2px solid #4285f4' : '2px solid transparent',
                marginBottom: '-2px',
              }}
            >
              📁 Upload Photo
            </button>
          </div>

          {/* Text Input */}
          {inputMethod === 'text' && (
            <div>
              <textarea
                value={inputText}
                onChange={(e) => {
                  setInputText(e.target.value);
                  setEvents(null);
                  setParseResult(null);
                }}
                placeholder="Paste or type text here (e.g., event descriptions, schedules, etc.)..."
                rows={8}
                style={{ width: '100%', fontFamily: 'monospace', padding: '8px', border: '1px solid #ddd', borderRadius: '4px' }}
              />
            </div>
          )}

          {/* Camera Input */}
          {inputMethod === 'camera' && (
            <div>
              <CameraCapture onCapture={handleImageCapture} />
              {imagePreview && (
                <div style={{ marginTop: 16 }}>
                  <img 
                    src={imagePreview} 
                    alt="Captured" 
                    style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                  <button 
                    onClick={clearInput}
                    style={{ marginTop: 8, padding: '4px 8px', fontSize: '12px' }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* File Upload Input */}
          {inputMethod === 'upload' && (
            <div>
              <input 
                ref={fileInputRef} 
                type="file" 
                accept="image/*" 
                onChange={handleFileSelect}
                style={{ marginBottom: 16 }}
              />
              {imagePreview && (
                <div>
                  <img 
                    src={imagePreview} 
                    alt="Uploaded" 
                    style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', border: '1px solid #ddd' }}
                  />
                  <button 
                    onClick={clearInput}
                    style={{ marginTop: 8, padding: '4px 8px', fontSize: '12px' }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Parse Button */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
            <button 
              onClick={handleParse} 
              disabled={
                parsing || 
                (inputMethod === 'text' && !inputText.trim()) ||
                ((inputMethod === 'camera' || inputMethod === 'upload') && !selectedImage)
              }
              style={{
                padding: '10px 20px',
                fontSize: '16px',
                fontWeight: 'bold',
                backgroundColor: '#4285f4',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: parsing ? 'not-allowed' : 'pointer',
                opacity: (
                  parsing || 
                  (inputMethod === 'text' && !inputText.trim()) ||
                  ((inputMethod === 'camera' || inputMethod === 'upload') && !selectedImage)
                ) ? 0.6 : 1,
              }}
            >
              {parsing ? 'Analyzing with AI…' : 'Analyze with AI'}
            </button>
            {!parsing && (
              <div style={{ fontSize: '12px', color: '#666' }}>
                {parseResult?.method === 'gemini' ? (
                  <span>Using: <strong>Gemini AI</strong> ({parseResult.model || 'gemini-2.0-flash'})</span>
                ) : (
                  <span>Using: <strong>Fallback Heuristic</strong> (Gemini API key not set)</span>
                )}
              </div>
            )}
          </div>
        </section>

        {events && (
          <section style={{ marginBottom: 32 }}>
            <h2>2) Parsed Events Preview</h2>
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
                <li key={idx} style={{ marginBottom: 12, padding: '12px', background: 'white', borderRadius: '4px', border: '1px solid #ddd', cursor: 'pointer' }}
                    onClick={() => setEditingEventIndex(idx)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'white';
                    }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div style={{ flex: 1 }}>
                      <div><strong>{ev.title}</strong></div>
                      <div style={{ marginTop: 4, color: '#666' }}>
                        {ev.allDay ? (
                          <>
                            {new Date(ev.startISO).toLocaleDateString('en-US', { timeZone: 'America/New_York' })} {ev.startISO !== ev.endISO ? `→ ${new Date(ev.endISO).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}` : ''} <span style={{ fontWeight: 'bold', color: '#4285f4' }}>(All Day)</span>
                          </>
                        ) : (
                          <>
                            {new Date(ev.startISO).toLocaleString('en-US', { timeZone: 'America/New_York' })} → {new Date(ev.endISO).toLocaleString('en-US', { timeZone: 'America/New_York' })}
                          </>
                        )}
                      </div>
                      {ev.location && <div style={{ marginTop: 4 }}>📍 {ev.location}</div>}
                      {ev.description && <div style={{ marginTop: 4, color: '#666' }}>{ev.description}</div>}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingEventIndex(idx);
                      }}
                      style={{
                        marginLeft: '12px',
                        padding: '4px 12px',
                        border: '1px solid #4285f4',
                        borderRadius: '4px',
                        backgroundColor: 'white',
                        color: '#4285f4',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Edit
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            
            {/* Show extracted raw text below the events list */}
            {parseResult?.extractedText && (
              <div style={{ marginTop: 24, padding: '12px', background: '#f5f5f5', borderRadius: '6px', border: '1px solid #ddd' }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px', color: '#333' }}>
                  📝 Raw Text Extracted from Image:
                </div>
                <div style={{ 
                  fontSize: '13px', 
                  color: '#555', 
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  padding: '8px',
                  background: 'white',
                  borderRadius: '4px',
                  border: '1px solid #ddd'
                }}>
                  {parseResult.extractedText}
                </div>
              </div>
            )}
            
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

      {/* Event Edit Modal */}
      {events && editingEventIndex !== null && (
        <EventEditModal
          event={events[editingEventIndex]}
          index={editingEventIndex}
          total={events.length}
          isOpen={editingEventIndex !== null}
          onClose={() => setEditingEventIndex(null)}
          onSave={handleEventSave}
        />
      )}
    </div>
  );
}

