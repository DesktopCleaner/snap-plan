import { z } from 'zod';

const ParsedEventSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  startISO: z.string(),
  endISO: z.string(),
  timezone: z.string().optional(),
});

export type ParsedEvent = z.infer<typeof ParsedEventSchema>;

export type ParseResult = {
  events: ParsedEvent[];
  method: 'gemini' | 'fallback';
  reason?: string;
  model?: string;
  extractedText?: string; // The text extracted from image or input text
};

// Convert Blob to base64 data URL
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Extract base64 data from data URL
function extractBase64(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(',');
  return commaIndex !== -1 ? dataUrl.substring(commaIndex + 1) : dataUrl;
}

// Get MIME type from Blob
function getMimeType(blob: Blob): string {
  return blob.type || 'image/jpeg';
}

export async function parseWithAI(input: string | Blob): Promise<ParseResult> {
  const preferLocalRule = import.meta.env.VITE_AI_PARSE_MODE === 'local';
  if (preferLocalRule) {
    const text = typeof input === 'string' ? input : 'Image input (local mode not supported for images)';
    return {
      events: fallbackHeuristic(text),
      method: 'fallback',
      reason: 'VITE_AI_PARSE_MODE is set to "local"',
      extractedText: typeof input === 'string' ? input : undefined,
    };
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    const text = typeof input === 'string' ? input : 'Image input (API key not set)';
    return {
      events: fallbackHeuristic(text),
      method: 'fallback',
      reason: 'VITE_GEMINI_API_KEY is not set',
      extractedText: typeof input === 'string' ? input : undefined,
    };
  }

// Get model name and trim whitespace/quotes (in case env var has quotes)

// Get model name - default to gemini-1.5-flash (most reliable and widely available)
// Valid models: gemini-1.5-flash (recommended), gemini-1.5-pro, gemini-pro
const modelRaw = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.0-flash';
const model = modelRaw.trim().replace(/^['"]|['"]$/g, ''); // Remove surrounding quotes if present
  
  const isImage = input instanceof Blob;
  const currentYear = new Date().getFullYear();
  
  const prompt = isImage 
    ? `Step 1: Extract ALL raw text from this image (exactly as it appears, preserving formatting).
Step 2: Analyze the extracted text and parse calendar events.

Return ONLY a JSON object with this structure:
{
  "rawText": "all text extracted from image",
  "events": [
    {
      "title": "string",
      "description": "string (optional)",
      "location": "string (optional)",
      "startISO": "ISO 8601 UTC",
      "endISO": "ISO 8601 UTC",
      "timezone": "IANA timezone (optional)"
    }
  ]
}

CRITICAL TIME RULES:
- If times are written in the text (e.g., "6pm", "6:00 PM", "18:00", "6pm - 9pm"), you MUST use those exact times.
- Convert times to 24-hour format in UTC (e.g., "6pm" = 18:00, "9pm" = 21:00).
- If the text shows a time range like "6pm - 9pm", use 18:00:00 for start and 21:00:00 for end.
- ONLY use default times (00:00:00 start, 00
:00:00 end) if NO time is mentioned at all.
- DO NOT use defaults if ANY time is mentioned, even if it's just one time.

EXAMPLE:
- If text says "September 17th CC 6pm - 9pm", the event should be:
  * startISO: "2025-09-17T18:00:00Z" (6pm = 18:00)
  * endISO: "2025-09-17T21:00:00Z" (9pm = 21:00)
- DO NOT use 14:00:00 or 15:00:00 if "6pm - 9pm" is written in the text!

OTHER RULES:
- Year: Use ${currentYear} if not specified
- Date: Parse the date from the text (e.g., "September 17th" = September 17, ${currentYear})

Return ONLY JSON, no markdown, no explanation.`
    : `Step 1: Extract the raw text (copy it exactly as provided).
Step 2: Analyze the text and parse calendar events.

Return ONLY a JSON object with this structure:
{
  "rawText": "the original input text",
  "events": [
    {
      "title": "string",
      "description": "string (optional)",
      "location": "string (optional)",
      "startISO": "ISO 8601 UTC",
      "endISO": "ISO 8601 UTC",
      "timezone": "IANA timezone (optional)"
    }
  ]
}

CRITICAL TIME RULES:
- If times are written in the text (e.g., "6pm", "6:00 PM", "18:00", "6pm - 9pm"), you MUST use those exact times.
- Convert times to 24-hour format in UTC (e.g., "6pm" = 18:00, "9pm" = 21:00).
- If the text shows a time range like "6pm - 9pm", use 18:00:00 for start and 21:00:00 for end.
- ONLY use default times (00:00:00 start, 00:00:00 end) if NO time is mentioned at all.
- DO NOT use defaults if ANY time is mentioned, even if it's just one time.

EXAMPLE:
- If text says "September 17th CC 6pm - 9pm", the event should be:
  * startISO: "2025-09-17T18:00:00Z" (6pm = 18:00)
  * endISO: "2025-09-17T21:00:00Z" (9pm = 21:00)
- DO NOT use 14:00:00 or 15:00:00 if "6pm - 9pm" is written in the text!

OTHER RULES:
- Year: Use ${currentYear} if not specified
- Date: Parse the date from the text (e.g., "September 17th" = September 17, ${currentYear})

Return ONLY JSON, no markdown, no explanation.

Text to parse:
${input}`;

  // Helper function to make API call
  // Using generativelanguage.googleapis.com which is already a global endpoint
  // This endpoint automatically routes to the best available region
  const callGeminiAPI = async (endpoint: string, modelName: string, parts: any[]): Promise<Response> => {
    // Use global REST API endpoint (not region-specific)
    // This endpoint automatically handles global routing and load balancing
    const url = `https://generativelanguage.googleapis.com/${endpoint}/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
    console.log(`Calling Gemini API (global endpoint): ${endpoint} endpoint, model: "${modelName}", input type: ${isImage ? 'image' : 'text'}`);
    
    // Build generation config
    // Note: responseMimeType is not supported by all models/endpoints, so we'll parse JSON from text response
    const generationConfig: any = {
      temperature: 0.2,
    };
    
    // Only add responseMimeType for specific newer models that support it
    // This feature may not be available for all models, so we'll handle JSON parsing manually if needed
    // Commented out to avoid 400 errors - we'll parse JSON from text response instead
    // if (endpoint === 'v1beta' && modelName.includes('1.5')) {
    //   generationConfig.responseMimeType = 'application/json';
    // }
    
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: parts,
          },
        ],
        generationConfig: generationConfig,
      }),
    });
  };

  try {
    console.log(`Using model: "${model}" (trimmed from: "${model}")`);
    
    // Prepare parts for API call
    let parts: any[];
    if (isImage) {
      // Convert image blob to base64
      const dataUrl = await blobToBase64(input);
      const base64Data = extractBase64(dataUrl);
      const mimeType = getMimeType(input);
      
      parts = [
        {
          text: prompt,
        },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64Data,
          },
        },
      ];
    } else {
      parts = [{ text: prompt }];
    }
    
    // Try different models and endpoints in order of preference
    // Using global endpoint (generativelanguage.googleapis.com) which automatically routes globally
    let resp: Response | null = null;
    const modelsToTry = [
      model, // Try the user's specified model first
      'gemini-2.0-flash', // Newer model
      'gemini-1.5-flash', // Most reliable and widely available fallback
      'gemini-pro', // Older but widely available fallback
      'gemini-2.0-pro', // If available
      'gemini-1.5-pro', // If available
      'gemini-2.0-flash-lite',
      'gemini-2.0-flash-exp',
    ];
    
    // Remove duplicates
    const uniqueModels = [...new Set(modelsToTry)];
    
    // Try v1beta first (newer API version, better model support)
    // Then fallback to v1 if needed
    const endpointsToTry = ['v1beta', 'v1'];
    
    for (const endpointToTry of endpointsToTry) {
      for (const modelToTry of uniqueModels) {
        console.log(`Trying model: "${modelToTry}" via ${endpointToTry} (global endpoint)`);
        
        resp = await callGeminiAPI(endpointToTry, modelToTry, parts);
        
        if (resp.ok) {
          console.log(`✅ Successfully connected to model: "${modelToTry}" via ${endpointToTry} (global endpoint)`);
          break;
        }
        
        // If 404, try next model
        if (resp.status === 404) {
          console.warn(`Model "${modelToTry}" not found via ${endpointToTry}, trying next...`);
          continue;
        } else {
          // If it's not a 404, don't try other models (might be auth error, etc.)
          console.error(`Non-404 error (${resp.status}) for "${modelToTry}" via ${endpointToTry}, stopping model fallback`);
          break;
        }
      }
      
      // If we got a successful response, break out of endpoint loop
      if (resp && resp.ok) {
        break;
      }
    }
    
    // Final fallback
    if (!resp || !resp.ok) {
      console.warn('All models and endpoints failed, trying final fallback...');
      resp = await callGeminiAPI('v1beta', model, parts);
    }

    if (!resp.ok) {
      let errorDetails = 'Unknown error';
      let errorMessage = '';
      
      try {
        const errorData = await resp.json();
        errorMessage = errorData?.error?.message || '';
        errorDetails = errorData?.error?.message || errorData?.error || `HTTP ${resp.status}`;
        
        console.error('Gemini API error response:', errorData);
      } catch (e) {
        const text = await resp.text().catch(() => '');
        errorDetails = text || `HTTP ${resp.status} ${resp.statusText}`;
        console.error('Gemini API error (non-JSON):', resp.status, text);
      }
      
      // Provide helpful error messages based on status code
      let userFriendlyReason = '';
      if (resp.status === 404) {
        userFriendlyReason = `All Gemini models returned 404 (not found). This usually means:\n\n` +
          `🔴 CRITICAL: The Gemini API (Generative Language API) is likely NOT enabled in your Google Cloud project.\n\n` +
          `Steps to fix:\n` +
          `1. Go to Google Cloud Console: https://console.cloud.google.com/\n` +
          `2. Select the project where your API key was created\n` +
          `3. Go to "APIs & Services" > "Library"\n` +
          `4. Search for "Generative Language API" (or "Gemini API")\n` +
          `5. Click on it and click "Enable"\n` +
          `6. Wait a few minutes for it to enable\n` +
          `7. Restart your dev server and try again\n\n` +
          `Alternative: Your API key might be from a different project. Make sure:\n` +
          `- The API key and the enabled API are in the same Google Cloud project\n` +
          `- The API key has the correct permissions\n\n` +
          `Models tried: gemini-1.5-flash, gemini-pro, gemini-1.5-pro`;
      } else if (resp.status === 401 || resp.status === 403) {
        userFriendlyReason = `API key invalid or missing permissions (${resp.status}). Check your VITE_GEMINI_API_KEY in .env file and ensure the Gemini API (Generative Language API) is enabled in Google Cloud Console.`;
      } else if (resp.status === 400) {
        userFriendlyReason = `Bad request (400): ${errorMessage || errorDetails}. Check your API key format and model name.`;
      } else {
        userFriendlyReason = `API error (${resp.status}): ${errorMessage || errorDetails}`;
      }
      
      console.error(`Gemini API call failed: ${userFriendlyReason}`);
      
      const text = typeof input === 'string' ? input : 'Image input';
      return {
        events: fallbackHeuristic(text),
        method: 'fallback',
        reason: userFriendlyReason,
        model,
        extractedText: typeof input === 'string' ? input : undefined,
      };
    }
    
    const data = await resp.json();
    
    // Try to get JSON response directly (if responseMimeType was set to application/json)
    let json: any;
    let responseText: string | undefined;
    
    // Check if response is already JSON (when responseMimeType is set)
    const candidate = data?.candidates?.[0];
    if (candidate?.content?.parts?.[0]?.text) {
      responseText = candidate.content.parts[0].text;
    }
    
    if (responseText) {
      try {
        json = JSON.parse(responseText);
      } catch (parseError) {
        console.warn('Failed to parse JSON from response text, trying to extract JSON from text:', responseText);
        // Try to extract JSON from markdown code blocks or plain text
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            json = JSON.parse(jsonMatch[0]);
          } catch {
            const text = typeof input === 'string' ? input : 'Image input';
            return {
              events: fallbackHeuristic(text),
              method: 'fallback',
              reason: 'Failed to parse JSON response from Gemini. Response: ' + responseText.substring(0, 200),
              model,
              extractedText: typeof input === 'string' ? input : undefined,
            };
          }
        } else {
          const text = typeof input === 'string' ? input : 'Image input';
          return {
            events: fallbackHeuristic(text),
            method: 'fallback',
            reason: 'No valid JSON found in Gemini response. Response: ' + responseText.substring(0, 200),
            model,
            extractedText: typeof input === 'string' ? input : undefined,
          };
        }
      }
    } else {
      const text = typeof input === 'string' ? input : 'Image input';
      return {
        events: fallbackHeuristic(text),
        method: 'fallback',
        reason: 'No text response from Gemini API',
        model,
        extractedText: typeof input === 'string' ? input : undefined,
      };
    }

    // Extract rawText and events from the JSON response
    // For images, the response should have both rawText and events
    // For text input, we just use the input text as extractedText
    const rawText = json?.rawText || (typeof input === 'string' ? input : undefined);
    
    // (Safely) Extract the events array from the JSON object
    const arr = Array.isArray(json?.events) ? json.events : Array.isArray(json) ? json : [];
    const parsed: ParsedEvent[] = [];
    for (const item of arr) {
      const res = ParsedEventSchema.safeParse(item);
      if (res.success) parsed.push(res.data);
    }
    
    if (parsed.length === 0) {
      const text = typeof input === 'string' ? input : 'Image input';
      return {
        events: fallbackHeuristic(text),
        method: 'fallback',
        reason: 'No valid events found in Gemini response',
        model,
        extractedText: rawText || (typeof input === 'string' ? input : undefined),
      };
    }
    
    // Post-process: ALWAYS check rawText for explicit times and override AI's times if found
    // This ensures the actual extracted text takes precedence over AI interpretation
    if (rawText) {
      console.log('🔍 Post-processing: Checking rawText for explicit times...');
      console.log('📝 rawText:', rawText.substring(0, 200));
      
      const fixedEvents = parsed.map((event, eventIdx) => {
        const startDate = new Date(event.startISO);
        const endDate = new Date(event.endISO);
        
        const originalStartUTC = `${startDate.getUTCHours()}:${String(startDate.getUTCMinutes()).padStart(2, '0')}`;
        const originalEndUTC = `${endDate.getUTCHours()}:${String(endDate.getUTCMinutes()).padStart(2, '0')}`;
        console.log(`📅 Event ${eventIdx + 1} original times: ${originalStartUTC} - ${originalEndUTC} UTC`);
        
        // ALWAYS try to extract times from rawText - prioritize extracted text over AI's interpretation
        // Match patterns like "6pm - 9pm", "6:00 PM - 9:00 PM", "6pm-9pm", "6-8pm", etc.
        // Order matters: check most common patterns first
        const timePatterns = [
          // Pattern: "6-8pm", "6-9pm" with no spaces - MOST COMMON FORMAT
          {
            regex: /(\d{1,2})[-–—](\d{1,2})\s*pm/gi,
            hasMinutes: false,
            bothPM: true,
          },
          {
            regex: /(\d{1,2})[-–—](\d{1,2})\s*am/gi,
            hasMinutes: false,
            bothAM: true,
          },
          // Pattern: "6 - 9pm", "6-9pm", "6–9pm", "6—9pm" (with optional spaces) - ALSO COMMON
          {
            regex: /(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*pm/gi,
            hasMinutes: false,
            bothPM: true,
          },
          // Pattern: "6 - 9am", "6-9am", "6–9am", "6—9am"
          {
            regex: /(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*am/gi,
            hasMinutes: false,
            bothAM: true,
          },
          // Pattern: "6pm - 9pm", "6pm-9pm", "6 pm - 9 pm", etc.
          {
            regex: /(\d{1,2})\s*pm\s*[-–—]\s*(\d{1,2})\s*pm/gi,
            hasMinutes: false,
          },
          // Pattern: "6am - 9am", "6am-9am", etc.
          {
            regex: /(\d{1,2})\s*am\s*[-–—]\s*(\d{1,2})\s*am/gi,
            hasMinutes: false,
          },
          // Pattern: "6:00 PM - 9:00 PM", "6:00PM-9:00PM", etc.
          {
            regex: /(\d{1,2}):(\d{2})\s*pm\s*[-–—]\s*(\d{1,2}):(\d{2})\s*pm/gi,
            hasMinutes: true,
          },
          // Pattern: "6:00 AM - 9:00 AM", etc.
          {
            regex: /(\d{1,2}):(\d{2})\s*am\s*[-–—]\s*(\d{1,2}):(\d{2})\s*am/gi,
            hasMinutes: true,
          },
          // Pattern: "6:00 - 9:00 PM" (first time without am/pm)
          {
            regex: /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s*pm/gi,
            hasMinutes: true,
            bothPM: true,
          },
          // Pattern: "6:00 - 9:00 AM"
          {
            regex: /(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s*am/gi,
            hasMinutes: true,
            bothAM: true,
          },
        ];
        
        let foundMatch = false;
        for (const pattern of timePatterns) {
          // Reset regex lastIndex to avoid issues with global flag
          pattern.regex.lastIndex = 0;
          const match = rawText.match(pattern.regex);
          if (match && match[0]) {
            foundMatch = true;
            const fullMatch = match[0];
            console.log(`✅ Found time pattern match: "${fullMatch}"`);
            let startHour: number;
            let startMin = 0;
            let endHour: number;
            let endMin = 0;
            
            if (pattern.hasMinutes) {
              if (pattern.bothPM || pattern.bothAM) {
                // Pattern like "6:00 - 9:00 PM" or "6:00 - 9:00 AM"
                const parts = fullMatch.match(/(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
                if (parts) {
                  startHour = parseInt(parts[1]);
                  startMin = parseInt(parts[2]);
                  endHour = parseInt(parts[3]);
                  endMin = parseInt(parts[4]);
                  const period = parts[5].toLowerCase();
                  
                  // Both times use the same period
                  if (period === 'pm') {
                    if (startHour !== 12) startHour += 12;
                    if (endHour !== 12) endHour += 12;
                  } else {
                    if (startHour === 12) startHour = 0;
                    if (endHour === 12) endHour = 0;
                  }
                } else {
                  continue;
                }
              } else {
                // Pattern with minutes: "6:00 PM - 9:00 PM"
                const parts = fullMatch.match(/(\d{1,2}):(\d{2})\s*(am|pm)\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(am|pm)/i);
                if (parts) {
                  startHour = parseInt(parts[1]);
                  startMin = parseInt(parts[2]);
                  const startPeriod = parts[3].toLowerCase();
                  endHour = parseInt(parts[4]);
                  endMin = parseInt(parts[5]);
                  const endPeriod = parts[6].toLowerCase();
                  
                  // Convert to 24-hour
                  if (startPeriod === 'pm' && startHour !== 12) startHour += 12;
                  if (startPeriod === 'am' && startHour === 12) startHour = 0;
                  if (endPeriod === 'pm' && endHour !== 12) endHour += 12;
                  if (endPeriod === 'am' && endHour === 12) endHour = 0;
                } else {
                  continue;
                }
              }
            } else {
              if (pattern.bothPM || pattern.bothAM) {
                // Pattern like "6 - 9pm", "6-9pm", "6 – 9pm", etc.
                // Try flexible pattern first (with or without spaces)
                const parts = fullMatch.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*(am|pm)/i) || 
                             fullMatch.match(/(\d{1,2})[-–—](\d{1,2})\s*(am|pm)/i);
                if (parts) {
                  startHour = parseInt(parts[1]);
                  endHour = parseInt(parts[2]);
                  const period = parts[3].toLowerCase();
                  
                  console.log(`   Extracted: ${startHour} and ${endHour}, period: ${period}`);
                  
                  // Both times use the same period
                  if (period === 'pm') {
                    if (startHour !== 12) startHour += 12;
                    if (endHour !== 12) endHour += 12;
                  } else {
                    if (startHour === 12) startHour = 0;
                    if (endHour === 12) endHour = 0;
                  }
                  
                  console.log(`   Converted to 24h: ${startHour}:00 - ${endHour}:00 (local time, will convert to UTC)`);
                } else {
                  console.log(`   ⚠️ Failed to parse match: "${fullMatch}"`);
                  continue;
                }
              } else {
                // Pattern without minutes: "6pm - 9pm"
                const parts = fullMatch.match(/(\d{1,2})\s*(am|pm)\s*[-–—]\s*(\d{1,2})\s*(am|pm)/i);
                if (parts) {
                  startHour = parseInt(parts[1]);
                  const startPeriod = parts[2].toLowerCase();
                  endHour = parseInt(parts[3]);
                  const endPeriod = parts[4].toLowerCase();
                  
                  // Convert to 24-hour
                  if (startPeriod === 'pm' && startHour !== 12) startHour += 12;
                  if (startPeriod === 'am' && startHour === 12) startHour = 0;
                  if (endPeriod === 'pm' && endHour !== 12) endHour += 12;
                  if (endPeriod === 'am' && endHour === 12) endHour = 0;
                } else {
                  continue;
                }
              }
            }
            
            // Extract times are in LOCAL timezone (not UTC)
            // We need to create dates in local timezone, then convert to UTC
            const timezone = event.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
            console.log(`   Using timezone: ${timezone}`);
            
            // Get the date parts from the original event (preserve the date)
            const year = startDate.getUTCFullYear();
            const month = startDate.getUTCMonth();
            const day = startDate.getUTCDate();
            
            // Create Date objects in LOCAL timezone
            // The Date constructor (year, month, day, hour, minute) interprets as LOCAL time
            // Then toISOString() converts to UTC automatically
            const newStart = new Date(year, month, day, startHour, startMin, 0);
            const newEnd = new Date(year, month, day, endHour, endMin, 0);
            
            // If end time is earlier than start (e.g., 8pm wraps to next day), adjust
            if (newEnd <= newStart) {
              newEnd.setDate(newEnd.getDate() + 1);
            }
            
            console.log(`✅ Overriding times from rawText: "${fullMatch}"`);
            console.log(`   Local time: ${startHour}:${String(startMin).padStart(2, '0')} - ${endHour}:${String(endMin).padStart(2, '0')} (${timezone})`);
            console.log(`   UTC time: ${newStart.toISOString()} → ${newEnd.toISOString()}`);
            console.log(`   Before: ${event.startISO} → ${event.endISO}`);
            
            return {
              ...event,
              startISO: newStart.toISOString(),
              endISO: newEnd.toISOString(),
              timezone: timezone, // Preserve or set timezone
            };
          }
        }
        
        if (!foundMatch) {
          console.log(`⚠️ No time pattern matched for event ${eventIdx + 1}. Searched in: "${rawText.substring(0, 100)}..."`);
        }
        
        return event;
      });
      
      return {
        events: fixedEvents,
        method: 'gemini',
        model,
        extractedText: rawText || (typeof input === 'string' ? input : undefined),
      };
    }
    
    return {
      events: parsed,
      method: 'gemini',
      model,
      extractedText: rawText || (typeof input === 'string' ? input : undefined),
    };
  } catch (error: any) {
    const text = typeof input === 'string' ? input : 'Image input';
    return {
      events: fallbackHeuristic(text),
      method: 'fallback',
      reason: `Error calling Gemini API: ${error?.message || 'Unknown error'}`,
      model,
      extractedText: typeof input === 'string' ? input : undefined,
    };
  }
}

// Fallback heuristic parser
function fallbackHeuristic(text: string): ParsedEvent[] {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return [
    {
      title: text.split('\n')[0]?.slice(0, 60) || 'Untitled Event',
      description: text.slice(0, 500),
      startISO: start.toISOString(),
      endISO: end.toISOString(),
    },
  ];
}

