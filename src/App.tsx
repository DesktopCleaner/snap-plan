import { useEffect, useRef, useState } from 'react';
import CameraCapture from './components/CameraCapture';
import EventEditModal from './components/EventEditModal';
import { parseWithAI, type ParsedEvent, type ParseResult } from './lib/parseWithAI';
import { toIcs } from './lib/ics';
import { initializeGoogleAuth, signIn, signOut, createCalendarEvent, getAccessToken, type GoogleUser } from './lib/googleAuth';

// COMMENTED OUT: Component for displaying single extracted text with fold/unfold
// function SingleTextDisplay({ text }: { text: string }) {
//   const [isExpanded, setIsExpanded] = useState(false);

//   return (
//     <div style={{ marginTop: 24, padding: '12px', background: '#f5f5f5', borderRadius: '6px', border: '1px solid #ddd' }}>
//       <div style={{ 
//         display: 'flex',
//         justifyContent: 'space-between',
//         alignItems: 'center'
//       }}>
//         <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#333' }}>
//           📝 Raw Text Extracted from Image:
//         </div>
//         <button
//           onClick={() => setIsExpanded(!isExpanded)}
//           style={{
//             padding: '4px 8px',
//             border: '1px solid #ddd',
//             borderRadius: '4px',
//             background: 'white',
//             cursor: 'pointer',
//             fontSize: '12px',
//             color: '#666'
//           }}
//         >
//           {isExpanded ? '▼ Collapse' : '▶ Expand'}
//         </button>
//       </div>
//       {isExpanded && (
//         <div style={{ 
//           marginTop: '8px',
//           fontSize: '13px', 
//           color: '#555', 
//           fontFamily: 'monospace',
//           whiteSpace: 'pre-wrap',
//           wordBreak: 'break-word',
//           maxHeight: '200px',
//           overflowY: 'auto',
//           padding: '8px',
//           background: 'white',
//           borderRadius: '4px',
//           border: '1px solid #ddd'
//         }}>
//           {text}
//         </div>
//       )}
//     </div>
//   );
// }

export default function App() {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [inputText, setInputText] = useState('');
  const [inputMethod, setInputMethod] = useState<'text' | 'camera' | 'upload'>('camera');
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
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  // COMMENTED OUT: Raw text display state
  // const [bulkExtractedTexts, setBulkExtractedTexts] = useState<Array<{ fileName: string; text: string }>>([]);
  // const [expandedTexts, setExpandedTexts] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Effect to fetch config from backend and initialize Google Auth
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        // Use relative URL for Vercel deployment, fallback to localhost for dev
        const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
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
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    // If multiple files selected, process them in bulk
    if (files.length > 1) {
      await handleBulkUpload(Array.from(files));
      return;
    }
    
    // Single file - use existing behavior
    const file = files[0];
    setSelectedImage(file);
    setInputMethod('upload');
    // Create preview
    const url = URL.createObjectURL(file);
    setImagePreview(url);
  };

  const handleBulkUpload = async (files: File[]) => {
    setBulkUploading(true);
    setBulkProgress({ current: 0, total: files.length });
    setInputMethod('upload');
    setEvents(null);
    setParseResult(null);
    setIcs(null);
    setEditingEventIndex(null);
    
    const allEvents: ParsedEvent[] = [];
    const allParseResults: ParseResult[] = [];
    const extractedTextsByImage: Array<{ fileName: string; text: string }> = [];
    
    try {
      // Process each file one by one
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setBulkProgress({ current: i + 1, total: files.length });
        
        try {
          console.log(`Processing image ${i + 1}/${files.length}: ${file.name}`);
          const result = await parseWithAI(file);
          allParseResults.push(result);
          
          // Store extracted text for this image
          if (result.extractedText) {
            extractedTextsByImage.push({
              fileName: file.name,
              text: result.extractedText,
            });
          }
          
          if (result.events && result.events.length > 0) {
            allEvents.push(...result.events);
            console.log(`✓ Found ${result.events.length} event(s) in ${file.name}`);
          } else {
            console.log(`⚠ No events found in ${file.name}`);
          }
        } catch (error: any) {
          console.error(`Error processing ${file.name}:`, error);
          // Continue with next file even if one fails
        }
      }
      
      // COMMENTED OUT: Store extracted texts for display
      // setBulkExtractedTexts(extractedTextsByImage);
      
      // Set all collected events
      if (allEvents.length > 0) {
        setEvents(allEvents);
        setParseResult({
          events: allEvents,
          method: allParseResults.some(r => r.method === 'gemini') ? 'gemini' : 'fallback',
          model: allParseResults.find(r => r.model)?.model,
          extractedText: allParseResults.map(r => r.extractedText).filter(Boolean).join('\n\n---\n\n'),
        });
        
        // Generate ICS for all events
        try {
          const icsContent = toIcs(allEvents);
          setIcs(icsContent);
        } catch (err) {
          console.error('ICS generation failed:', err);
          setIcs(null);
        }
        
        // Automatically open first event for editing
        setEditingEventIndex(0);
        
        alert(`Successfully processed ${files.length} image(s). Found ${allEvents.length} event(s) total.`);
      } else {
        alert(`Processed ${files.length} image(s) but no events were found.`);
      }
    } catch (error: any) {
      alert('Bulk upload failed: ' + (error?.message || 'Unknown error'));
    } finally {
      setBulkUploading(false);
      setBulkProgress(null);
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
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
    // COMMENTED OUT: Clear raw text display state
    // setBulkExtractedTexts([]);
    // setExpandedTexts(new Set());
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
              📁 Upload Photo(s)
            </button>
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
          </div>

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
                multiple
                onChange={handleFileSelect}
                style={{ marginBottom: 16 }}
              />
              {bulkUploading && bulkProgress && (
                <div style={{ 
                  marginBottom: 16, 
                  padding: '12px', 
                  background: '#e3f2fd', 
                  borderRadius: '4px',
                  border: '1px solid #2196f3'
                }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                    Processing images... ({bulkProgress.current} / {bulkProgress.total})
                  </div>
                  <div style={{ 
                    width: '100%', 
                    background: '#fff', 
                    borderRadius: '4px', 
                    height: '20px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${(bulkProgress.current / bulkProgress.total) * 100}%`,
                      background: '#2196f3',
                      height: '100%',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              )}
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
            {!parsing && parseResult && (
              <div style={{ fontSize: '12px', color: '#666' }}>
                {parseResult.method === 'gemini' ? (
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
            
            {/* COMMENTED OUT: Raw text display functionality */}
            {/* Show extracted texts from bulk upload
            {bulkExtractedTexts.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px', color: '#333' }}>
                  📝 Raw Text Extracted from Images:
                </div>
                {bulkExtractedTexts.map((item, idx) => {
                  const isExpanded = expandedTexts.has(idx);
                  
                  return (
                    <div key={idx} style={{ 
                      marginBottom: 16, 
                      padding: '12px', 
                      background: '#f5f5f5', 
                      borderRadius: '6px', 
                      border: '1px solid #ddd' 
                    }}>
                      <div style={{ 
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}>
                        <div style={{ 
                          fontWeight: 'bold', 
                          color: '#4285f4',
                          fontSize: '13px'
                        }}>
                          📷 {item.fileName}
                        </div>
                        <button
                          onClick={() => {
                            const newExpanded = new Set(expandedTexts);
                            if (isExpanded) {
                              newExpanded.delete(idx);
                            } else {
                              newExpanded.add(idx);
                            }
                            setExpandedTexts(newExpanded);
                          }}
                          style={{
                            padding: '4px 8px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            background: 'white',
                            cursor: 'pointer',
                            fontSize: '12px',
                            color: '#666'
                          }}
                        >
                          {isExpanded ? '▼ Collapse' : '▶ Expand'}
                        </button>
                      </div>
                      {isExpanded && (
                        <div style={{ 
                          marginTop: '8px',
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
                          {item.text}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            Show extracted text for single image/text input
            {parseResult?.extractedText && bulkExtractedTexts.length === 0 && (
              <SingleTextDisplay text={parseResult.extractedText} />
            )}
            */}
            
            <div style={{ marginTop: 16 }}>
              {ics && (
                <button onClick={downloadIcs} style={{ marginRight: 8 }}>
                  Download .ics (optional)
                </button>
              )}
              {!user && <span style={{ marginRight: 8, color: '#666' }}>Sign in first</span>}
              <button onClick={createEvents} disabled={creating || !user}>
                {creating ? 'Creating…' : 'Create in Google Calendar'}
              </button>
              {ics && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', color: '#666' }}>Show ICS preview (optional)</summary>
                  <pre style={{ whiteSpace: 'pre-wrap', background: '#f5f5f5', padding: '8px', borderRadius: '4px', marginTop: '8px', fontSize: '12px' }}>{ics}</pre>
                </details>
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

