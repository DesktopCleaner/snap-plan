import { z } from 'zod';
import { createDateFromTimezone } from './dateUtils';

const ParsedEventSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  location: z.string().optional(),
  startISO: z.string(),
  endISO: z.string(),
  timezone: z.string().optional(),
  allDay: z.boolean().optional(),
});

export type ParsedEvent = z.infer<typeof ParsedEventSchema>;

export type ParseResult = {
  events: ParsedEvent[];
  method: 'gemini' | 'fallback';
  reason?: string;
  model?: string;
  extractedText?: string; // The text extracted from image or input text
};

// Convert blob to base64 data URL
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Extract base64 data from data URL
function extractBase64(dataUrl: string): string {
  return dataUrl.split(',')[1];
}

// Get MIME type from blob
function getMimeType(blob: Blob): string {
  return blob.type || 'image/jpeg';
}

export async function parseWithAI(input: string | Blob): Promise<ParseResult> {
  // Fetch config from backend
  // Use relative URL for Vercel deployment, fallback to localhost for dev
  const backendUrl = import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');
  let config;
  try {
    const configResponse = await fetch(`${backendUrl}/api/config`);
    if (!configResponse.ok) {
      throw new Error(`Failed to fetch config: ${configResponse.status}`);
    }
    config = await configResponse.json();
  } catch (error: any) {
    const text = typeof input === 'string' ? input : 'Image input';
    return {
      events: fallbackHeuristic(text),
      method: 'fallback',
      reason: `Failed to fetch config from backend: ${error.message}. Make sure the backend server is running.`,
      extractedText: typeof input === 'string' ? input : undefined,
    };
  }

  // Check if local mode is enabled
  if (config.aiParseMode === 'local') {
    const text = typeof input === 'string' ? input : 'Image input (local mode not supported for images)';
    return {
      events: fallbackHeuristic(text),
      method: 'fallback',
      reason: 'AI_PARSE_MODE is set to "local"',
      extractedText: typeof input === 'string' ? input : undefined,
    };
  }

  // Get model name from config (which uses GEMINI_MODEL env var), trim whitespace and quotes
  const modelRaw = config.geminiModel || 'gemini-2.5-flash';
  const model = modelRaw.trim().replace(/^['"]|['"]$/g, '');
  
  const isImage = input instanceof Blob;
  const currentYear = new Date().getFullYear();
  
  // Prepare image data if input is an image
  let imageData: string | undefined;
  let mimeType: string | undefined;
  let extractedText: string | undefined;
  
  if (isImage) {
    try {
      // Convert image blob to base64 for Gemini Vision
      const dataUrl = await blobToBase64(input);
      imageData = extractBase64(dataUrl);
      mimeType = getMimeType(input);
      console.log('Image prepared for Gemini Vision, size:', input.size, 'bytes');
    } catch (error: any) {
      console.error('Failed to process image:', error);
      return {
        events: fallbackHeuristic('Image input'),
        method: 'fallback',
        reason: `Failed to process image: ${error.message}`,
        extractedText: undefined,
      };
    }
  } else {
    extractedText = input;
  }
  
  // Use different prompts for image vs text input
  const prompt = isImage 
    ? `Analyze this event poster/flyer image and extract the calendar event information.

Step 1: Extract all relevant text from the image (ignore decorative elements, logos, and graphics).
Step 2: Parse the calendar event from the extracted information.

Return ONLY a JSON object with this EXACT structure (no markdown, no code blocks, no explanation):
{
  "rawText": "the text extracted from the image",
  "event": {
    "title": "string",
    "description": "string (optional)",
    "location": "string (optional)",
    "startISO": "ISO 8601 UTC string like ${currentYear}-11-29T10:30:00Z",
    "endISO": "ISO 8601 UTC string like ${currentYear}-11-29T16:00:00Z",
    "timezone": "IANA timezone (optional)",
    "allDay": false,
    "hasFreeFood": false,
    "registrationNeeded": null
  }
}

CRITICAL: Return ONLY the raw JSON object, no markdown code blocks, no \`\`\`json, no explanation. Start with { and end with }.`
    : `Step 1: Extract the raw text (copy it exactly as provided).
Step 2: Analyze the text and parse the calendar event.

Return ONLY a JSON object with this EXACT structure (no markdown, no code blocks, no explanation):
{
  "rawText": "the original input text",
  "event": {
    "title": "string",
    "description": "string (optional)",
    "location": "string (optional)",
    "startISO": "ISO 8601 UTC string like ${currentYear}-11-29T10:30:00Z",
    "endISO": "ISO 8601 UTC string like ${currentYear}-11-29T16:00:00Z",
    "timezone": "IANA timezone (optional)",
    "allDay": false,
    "hasFreeFood": false,
    "registrationNeeded": null
  }
}

FREE FOOD DETECTION:
- Set "hasFreeFood": true if the text mentions:
  * "free food", "free food!", "FREE FOOD", "free lunch", "free dinner", "free snacks", etc.
  * Any variation indicating complimentary food
- Set "hasFreeFood": false if no mention of free food

REGISTRATION DETECTION:
- Set "registrationNeeded": true if the text explicitly mentions:
  * "registration required", "register", "RSVP", "sign up", "registration needed", etc.
- Set "registrationNeeded": false if the text explicitly says no registration needed
- Set "registrationNeeded": null if registration is not mentioned at all

CRITICAL: Return ONLY the raw JSON object, no markdown code blocks, no \`\`\`json, no explanation. Start with { and end with }.

ALL-DAY EVENT DETECTION:
- Set "allDay": true if:
  * Text explicitly says "all day", "all-day", "all day event", "full day", etc.
  * NO time is mentioned at all (only date)
  * Text says "all of [date]" or similar
- Set "allDay": false (or omit) if any time is mentioned

CRITICAL TIME RULES:
- If times are written in the text (e.g., "6pm", "6:00 PM", "18:00", "6pm - 9pm"), you MUST use those exact times.
- Convert times to 24-hour format (e.g., "6pm" = 18:00, "9pm" = 21:00).
- If the text shows a time range like "6pm - 9pm", use 18:00:00 for start and 21:00:00 for end.
- For all-day events: use 00:00:00 for start and 23:59:59 for end (or next day 00:00:00).

TIMEZONE RULES (CRITICAL):
- If timezone is NOT specified in the text, assume the times are in EST (America/New_York), and convert to UTC for storage.
- If timezone IS specified (e.g., "6pm PST", "6pm UTC"), convert to UTC.
- Example: "6pm PST" should be converted to "9pm EST" (which is 02:00 UTC next day).
- Example: "6pm" (no timezone) should be treated as "6pm EST" (which is 23:00 UTC same day in standard time, or 22:00 UTC in daylight time).
- Always set timezone field to "America/New_York" if not specified.

YEAR RULES (CRITICAL):
- If year is NOT mentioned in the text, ALWAYS use ${currentYear} (the current year).z
- Examples:
  * "September 17th" → Use ${currentYear}-09-17
  * "November 29, 2025" → Use 2025-11-29 (year is specified)
  * "NOVEMBER 29, 2025" → Use 2025-11-29 (year is specified)
  * "March 15" (no year) → Use ${currentYear}-03-15

DESCRIPTION RULES:
- The description should contain the complete text extracted from the image or input.
- Do not summarize or filter - include everything from rawText in the description.

EXAMPLES:
- "September 17th CC 6pm - 9pm" → allDay: false, startISO: "${currentYear}-09-17T18:00:00Z", endISO: "${currentYear}-09-17T21:00:00Z"
- "September 17th - All Day Event" → allDay: true, startISO: "${currentYear}-09-17T00:00:00Z", endISO: "${currentYear}-09-17T23:59:59Z"
- "September 17th" (no time) → allDay: true, startISO: "${currentYear}-09-17T00:00:00Z", endISO: "${currentYear}-09-17T23:59:59Z"

CRITICAL: Return ONLY the raw JSON object, no markdown code blocks, no \`\`\`json, no explanation. Start with { and end with }.

${!isImage ? `Text to parse:\n${extractedText}` : ''}`;

  try {
    // Prepare request body for backend
    const requestBody: any = {
      model,
      prompt,
    };
    
    // Add image data if input is an image
    if (isImage && imageData && mimeType) {
      requestBody.imageData = imageData;
      requestBody.mimeType = mimeType;
    }
    
    console.log(`Calling backend Gemini API proxy, model: "${model}", input type: ${isImage ? 'image' : 'text'}`);
    const resp = await fetch(`${backendUrl}/api/gemini`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!resp.ok) {
      let errorDetails = 'Unknown error';
      let errorMessage = '';
      
      try {
        const errorData = await resp.json();
        errorMessage = errorData?.message || errorData?.error || '';
        errorDetails = errorData?.details || errorData?.error || errorData?.message || `HTTP ${resp.status}`;
        
        console.error('Backend Gemini API error response:', errorData);
      } catch (e) {
        const text = await resp.text().catch(() => '');
        errorDetails = text || `HTTP ${resp.status} ${resp.statusText}`;
        console.error('Backend Gemini API error (non-JSON):', resp.status, text);
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
          `7. Restart your backend server and try again\n\n` +
          `Alternative: Your API key might be from a different project. Make sure:\n` +
          `- The API key and the enabled API are in the same Google Cloud project\n` +
          `- The API key has the correct permissions\n\n` +
          `Models tried: gemini-1.5-flash, gemini-pro, gemini-1.5-pro`;
      } else if (resp.status === 401 || resp.status === 403) {
        userFriendlyReason = `API key invalid or missing permissions (${resp.status}). Check your GEMINI_API_KEY in .env file on the server and ensure the Gemini API (Generative Language API) is enabled in Google Cloud Console.`;
      } else if (resp.status === 400) {
        userFriendlyReason = `Bad request (400): ${errorMessage || errorDetails}. Check your API key format and model name.`;
      } else if (resp.status === 500) {
        userFriendlyReason = `Backend server error (500): ${errorMessage || errorDetails}. Check your backend server logs.`;
      } else {
        userFriendlyReason = `API error (${resp.status}): ${errorMessage || errorDetails}`;
      }
      
      console.error(`Backend Gemini API call failed: ${userFriendlyReason}`);
      
      return {
        events: fallbackHeuristic(extractedText || (isImage ? 'Image input' : '')),
        method: 'fallback',
        reason: userFriendlyReason,
        model,
        extractedText: extractedText,
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
      // Remove markdown code blocks if present (```json ... ``` or ``` ... ```)
      let cleanedText = responseText.trim();
      if (cleanedText.startsWith('```')) {
        // Remove opening ```json or ```
        cleanedText = cleanedText.replace(/^```(?:json)?\s*\n?/i, '');
        // Remove closing ```
        cleanedText = cleanedText.replace(/\n?```\s*$/, '');
        cleanedText = cleanedText.trim();
      }
      
      try {
        json = JSON.parse(cleanedText);
      } catch (parseError) {
        console.warn('Failed to parse JSON from response text, trying to extract JSON from text:', responseText);
        // Try to extract JSON from markdown code blocks or plain text
        // First try to match array: [...]
        let jsonMatch = cleanedText.match(/\[[\s\S]*\]/);
        // If no array, try object: {...}
        if (!jsonMatch) {
          jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        }
        if (jsonMatch) {
          try {
            json = JSON.parse(jsonMatch[0]);
          } catch {
            return {
              events: fallbackHeuristic(extractedText || (isImage ? 'Image input' : '')),
              method: 'fallback',
              reason: 'Failed to parse JSON response from Gemini. Response: ' + responseText.substring(0, 200),
              model,
              extractedText: extractedText,
            };
          }
        } else {
          return {
            events: fallbackHeuristic(extractedText || (isImage ? 'Image input' : '')),
            method: 'fallback',
            reason: 'No valid JSON found in Gemini response. Response: ' + responseText.substring(0, 200),
            model,
            extractedText: extractedText,
          };
        }
      }
    } else {
      return {
        events: fallbackHeuristic(extractedText || (isImage ? 'Image input' : '')),
        method: 'fallback',
        reason: 'No text response from Gemini API',
        model,
        extractedText: extractedText,
      };
    }

    // Extract rawText and events from the JSON response
    // Use the extracted text (either from OCR for images, or direct input for text)
    const rawText = json?.rawText || extractedText;
    
    // Extract the event from the JSON object
    // Handle case where json has event property, or events array (backward compatibility), or is the event itself
    let eventItem: any = null;
    if (json?.event && typeof json.event === 'object') {
      // New format: { rawText: "...", event: {...} }
      eventItem = json.event;
    } else if (Array.isArray(json?.events) && json.events.length > 0) {
      // Backward compatibility: { rawText: "...", events: [...] }
      eventItem = json.events[0];
    } else if (json?.events && typeof json.events === 'object') {
      // Backward compatibility: { rawText: "...", events: {...} }
      eventItem = json.events;
    } else if (typeof json === 'object' && json !== null) {
      // Check if json itself looks like an event
      if (json.startISO || json.start || json.startTime || json.start?.dateTime) {
        eventItem = json;
      }
    }
    
    const parsed: ParsedEvent[] = [];
    if (eventItem) {
      const item = eventItem;
      // Try to normalize the event object - handle common variations
      // Handle Google Calendar API format: start.dateTime, end.dateTime
      let startISO = item.startISO || item.start || item.startTime || item.startDate;
      let endISO = item.endISO || item.end || item.endTime || item.endDate;
      
      // Handle nested Google Calendar format: { start: { dateTime: "...", timeZone: "..." } }
      if (!startISO && item.start) {
        startISO = item.start.dateTime || item.start.date || item.start;
      }
      if (!endISO && item.end) {
        endISO = item.end.dateTime || item.end.date || item.end;
      }
      
      // Extract timezone from nested structure if available
      let sourceTimezone = item.timezone || item.tz || '';
      if (!sourceTimezone && item.start?.timeZone) {
        sourceTimezone = item.start.timeZone;
      }
      
      // Default to EST if no timezone specified
      const targetTimezone = 'America/New_York';
      if (!sourceTimezone) {
        sourceTimezone = targetTimezone;
      }
      
      // Convert timezone-aware datetime: sourceTimezone -> UTC
      // If sourceTimezone is EST and the time has 'Z', treat it as EST (not UTC) and convert
      let startISOToConvert = startISO;
      if (startISO && sourceTimezone === 'America/New_York' && startISO.endsWith('Z')) {
        startISOToConvert = startISO.slice(0, -1);
      }
      
      if (startISOToConvert && sourceTimezone && !startISOToConvert.endsWith('Z') && !startISOToConvert.match(/[+-]\d{2}:\d{2}$/)) {
        try {
          // Parse datetime components
            const dateMatch = startISOToConvert.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
          if (dateMatch) {
            const [, year, month, day, hour, minute] = dateMatch;
            // Use createDateFromTimezone helper to properly convert from EST to UTC
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            const finalDate = createDateFromTimezone(dateStr, timeStr, sourceTimezone);
            startISO = finalDate.toISOString();
          } else {
            // Fallback: try to parse as-is
            const d = new Date(startISO);
            if (!isNaN(d.getTime())) {
              startISO = d.toISOString();
            }
          }
        } catch (e) {
          console.warn('Failed to convert startISO with timezone, using as-is:', e);
          try {
            const d = new Date(startISO);
            if (!isNaN(d.getTime())) {
              startISO = d.toISOString();
            }
          } catch (e2) {
            console.warn('Failed to parse startISO:', e2);
          }
        }
      } else if (startISOToConvert && !startISOToConvert.endsWith('Z') && !startISOToConvert.match(/[+-]\d{2}:\d{2}$/)) {
        // No timezone specified - use EST (already set as sourceTimezone)
        if (sourceTimezone) {
          // Use EST to convert
          try {
            const dateMatch = startISOToConvert.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
            if (dateMatch) {
              const [, year, month, day, hour, minute] = dateMatch;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
              const finalDate = createDateFromTimezone(dateStr, timeStr, sourceTimezone);
              startISO = finalDate.toISOString();
            } else {
              // Fallback: try to parse as UTC
              const d = new Date(startISO + 'Z');
              if (!isNaN(d.getTime())) {
                startISO = d.toISOString();
              }
            }
          } catch (e) {
            console.warn('Failed to convert startISO with default timezone, trying UTC:', e);
            // Fallback: try to parse as UTC
            try {
              const d = new Date(startISO + 'Z');
              if (!isNaN(d.getTime())) {
                startISO = d.toISOString();
              } else {
                const d2 = new Date(startISO);
                if (!isNaN(d2.getTime())) {
                  startISO = d2.toISOString();
                }
              }
            } catch (e2) {
              console.warn('Failed to parse startISO:', e2);
            }
          }
        } else {
          // No timezone at all, try to parse as UTC
          try {
            const d = new Date(startISO + 'Z');
            if (!isNaN(d.getTime())) {
              startISO = d.toISOString();
            } else {
              // Try without Z
              const d2 = new Date(startISO);
              if (!isNaN(d2.getTime())) {
                startISO = d2.toISOString();
              }
            }
          } catch (e) {
            console.warn('Failed to parse startISO:', e);
          }
        }
      }
      
      // Same fix for endISO - strip Z if EST
      let endISOToConvert = endISO;
      if (endISO && sourceTimezone === 'America/New_York' && endISO.endsWith('Z')) {
        endISOToConvert = endISO.slice(0, -1);
      }
      
      if (endISOToConvert && sourceTimezone && !endISOToConvert.endsWith('Z') && !endISOToConvert.match(/[+-]\d{2}:\d{2}$/)) {
        try {
          const dateMatch = endISOToConvert.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
          if (dateMatch) {
            const [, year, month, day, hour, minute] = dateMatch;
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
            const finalDate = createDateFromTimezone(dateStr, timeStr, sourceTimezone);
            endISO = finalDate.toISOString();
          } else {
            const d = new Date(endISO);
            if (!isNaN(d.getTime())) {
              endISO = d.toISOString();
            }
          }
        } catch (e) {
          console.warn('Failed to convert endISO with timezone, using as-is:', e);
          try {
            const d = new Date(endISO);
            if (!isNaN(d.getTime())) {
              endISO = d.toISOString();
            }
          } catch (e2) {
            console.warn('Failed to parse endISO:', e2);
          }
        }
      } else if (endISOToConvert && !endISOToConvert.endsWith('Z') && !endISOToConvert.match(/[+-]\d{2}:\d{2}$/)) {
        // No timezone specified - use EST (already set as sourceTimezone)
        if (sourceTimezone) {
          // Use EST to convert
          try {
            const dateMatch = endISOToConvert.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
            if (dateMatch) {
              const [, year, month, day, hour, minute] = dateMatch;
              const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
              const finalDate = createDateFromTimezone(dateStr, timeStr, sourceTimezone);
              endISO = finalDate.toISOString();
            } else {
              // Fallback: try to parse as UTC
              const d = new Date(endISO + 'Z');
              if (!isNaN(d.getTime())) {
                endISO = d.toISOString();
              }
            }
          } catch (e) {
            console.warn('Failed to convert endISO with default timezone, trying UTC:', e);
            // Fallback: try to parse as UTC
            try {
              const d = new Date(endISO + 'Z');
              if (!isNaN(d.getTime())) {
                endISO = d.toISOString();
              } else {
                const d2 = new Date(endISO);
                if (!isNaN(d2.getTime())) {
                  endISO = d2.toISOString();
                }
              }
            } catch (e2) {
              console.warn('Failed to parse endISO:', e2);
            }
          }
        } else {
          // No timezone at all, try to parse as UTC
          try {
            const d = new Date(endISO + 'Z');
            if (!isNaN(d.getTime())) {
              endISO = d.toISOString();
            } else {
              const d2 = new Date(endISO);
              if (!isNaN(d2.getTime())) {
                endISO = d2.toISOString();
              }
            }
          } catch (e) {
            console.warn('Failed to parse endISO:', e);
          }
        }
      }
      
      // Build description with hashtags
      let description = rawText || item.description || item.detail || item.details || '';
      const hashtags: string[] = [];
      
      // Check for free food
      const hasFreeFood = item.hasFreeFood === true || item.hasFreeFood === 'true';
      if (hasFreeFood) {
        hashtags.push('#Free Food');
      }
      
      // Check for registration
      const registrationNeeded = item.registrationNeeded;
      if (registrationNeeded === true || registrationNeeded === 'true') {
        hashtags.push('#Registration Needed');
      } else if (registrationNeeded === null || registrationNeeded === undefined) {
        hashtags.push('#Registration Not Mentioned');
      }
      // If registrationNeeded is false, don't add anything
      
      // Prepend hashtags to description
      if (hashtags.length > 0) {
        description = hashtags.join(' ') + '\n\n' + description;
      }
      
      const normalizedItem: any = {
        title: item.title || item.name || item.summary || 'Untitled Event',
        description: description,
        location: item.location || item.place || item.venue || '',
        startISO,
        endISO,
        timezone: targetTimezone,
        allDay: item.allDay !== undefined ? item.allDay : undefined,
      };
      
      // Validate required fields
      if (!normalizedItem.startISO || !normalizedItem.endISO) {
        console.warn('❌ Event missing required startISO or endISO:', normalizedItem);
      } else {
        const res = ParsedEventSchema.safeParse(normalizedItem);
        if (res.success) {
          parsed.push(res.data);
          console.log('✅ Validated event:', res.data);
        } else {
          console.warn('❌ Event validation failed:', res.error.errors);
          console.warn('   Original item:', item);
          console.warn('   Normalized item:', normalizedItem);
        }
      }
    }
    
    if (parsed.length === 0) {
      console.error('⚠️ No valid event found after parsing');
      console.error('   JSON structure:', json);
      return {
        events: fallbackHeuristic(extractedText || (isImage ? 'Image input' : '')),
        method: 'fallback',
        reason: 'No valid event found in Gemini response. Check console for details.',
        model,
        extractedText: extractedText,
      };
    }
    
    // Post-process: Check for all-day events and explicit times
    if (rawText) {
      const currentYear = new Date().getFullYear();
      const fixedEvents = parsed.map((event, eventIdx) => {
        // Description already has hashtags from normalization
        // Ensure rawText is included in description if it's not already there
        let updatedEvent = event;
        
        if (rawText) {
          // Check if description already contains rawText
          if (!event.description || !event.description.includes(rawText)) {
            // Extract hashtags if they exist at the start
            const hashtagMatch = event.description?.match(/^(#[^\n]+(?:\s+#[^\n]+)*\n\n)/);
            const hashtags = hashtagMatch ? hashtagMatch[1] : '';
            const descriptionWithoutHashtags = event.description?.replace(/^(#[^\n]+(?:\s+#[^\n]+)*\n\n)/, '') || '';
            
            // Combine: hashtags + rawText (or existing description if no rawText match)
            updatedEvent = { 
              ...event, 
              description: hashtags + (descriptionWithoutHashtags || rawText)
            };
          }
        }
        
        // Check if year is mentioned in rawText
        const yearInText = rawText.match(/\b(19|20)\d{2}\b/);
        
        if (!yearInText) {
          // No year mentioned in text - default to current year
          const startDate = new Date(updatedEvent.startISO);
          const endDate = new Date(updatedEvent.endISO);
          
          // Get date components in the event's timezone (or EST)
          const timezone = updatedEvent.timezone || 'America/New_York';
          const startFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          });
          
          const startParts = startFormatter.formatToParts(startDate);
          const getPart = (type: string) => {
            const part = startParts.find(p => p.type === type);
            return part ? parseInt(part.value) : 0;
          };
          
          const month = getPart('month') - 1; // Month is 0-indexed
          const day = getPart('day');
          const startHour = getPart('hour');
          const startMin = getPart('minute');
          
          // Calculate duration to preserve it
          const duration = endDate.getTime() - startDate.getTime();
          
          // Reconstruct with current year, preserving month, day, and time in the timezone
          const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const startTimeStr = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
          
          // Recreate dates with corrected year, preserving timezone
          const newStart = createDateFromTimezone(dateStr, startTimeStr, timezone);
          const newEnd = new Date(newStart.getTime() + duration);
          
          updatedEvent = {
            ...updatedEvent,
            startISO: newStart.toISOString(),
            endISO: newEnd.toISOString(),
          };
        }
        
        // First, check if this is an all-day event
        const allDayPatterns = [
          /all\s*day/gi,
          /all-day/gi,
          /all\s*day\s*event/gi,
          /full\s*day/gi,
          /entire\s*day/gi,
          /whole\s*day/gi,
        ];
        
        const hasAllDayText = allDayPatterns.some(pattern => pattern.test(rawText));
        const hasTimeInText = /(\d{1,2})\s*(am|pm|AM|PM|:\d{2})/i.test(rawText);
        
        // If "all day" is mentioned OR no time is found, mark as all-day
        if (hasAllDayText || (!hasTimeInText && !updatedEvent.allDay)) {
          console.log(`📅 Event ${eventIdx + 1}: Detected as all-day event`);
          const startDate = new Date(updatedEvent.startISO);
          
          // Get date components - use UTC methods to avoid timezone issues
          let year = startDate.getUTCFullYear();
          const month = startDate.getUTCMonth();
          const day = startDate.getUTCDate();
          
          // Create dates in EST timezone for all-day events (start and end of day)
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const newStart = createDateFromTimezone(dateStr, '00:00', 'America/New_York');
          const newEnd = createDateFromTimezone(dateStr, '23:59', 'America/New_York');
          
          updatedEvent = {
            ...updatedEvent,
            allDay: true,
            startISO: newStart.toISOString(),
            endISO: newEnd.toISOString(),
          };
        }
        
        
        // Check for explicit times in rawText
        const startDate = new Date(updatedEvent.startISO);
        
        // ALWAYS try to extract times from rawText - prioritize extracted text over AI's interpretation
        // Match patterns like "6pm - 9pm", "6:00 PM - 9:00 PM", "6pm-9pm", "6-8pm", etc.
        const timePatterns = [
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
          {
            regex: /(\d{1,2})\s*[-–—]\s*(\d{1,2})\s*pm/gi,
            hasMinutes: false,
            bothPM: true,
          },
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
          // Pattern: "10:30AM-4PM" (start with minutes+AM/PM, end without minutes+PM, no spaces)
          {
            regex: /(\d{1,2}):(\d{2})\s*(am|pm)\s*[-–—]\s*(\d{1,2})\s*(am|pm)/gi,
            hasMinutes: true,
            mixedFormat: true,
          },
        ];
        
        for (const pattern of timePatterns) {
          // Reset regex lastIndex to avoid issues with global flag
          pattern.regex.lastIndex = 0;
          const match = rawText.match(pattern.regex);
          if (match && match[0]) {
            const fullMatch = match[0];
            let startHour: number;
            let startMin = 0;
            let endHour: number;
            let endMin = 0;
            
            if (pattern.hasMinutes) {
              if ((pattern as any).mixedFormat) {
                // Pattern like "10:30AM-4PM" (start has minutes+AM/PM, end has no minutes+PM)
                const parts = fullMatch.match(/(\d{1,2}):(\d{2})\s*(am|pm)\s*[-–—]\s*(\d{1,2})\s*(am|pm)/i);
                if (parts) {
                  startHour = parseInt(parts[1]);
                  startMin = parseInt(parts[2]);
                  const startPeriod = parts[3].toLowerCase();
                  endHour = parseInt(parts[4]);
                  endMin = 0; // End time has no minutes
                  const endPeriod = parts[5].toLowerCase();
                  
                  // Convert to 24-hour
                  if (startPeriod === 'pm' && startHour !== 12) startHour += 12;
                  if (startPeriod === 'am' && startHour === 12) startHour = 0;
                  if (endPeriod === 'pm' && endHour !== 12) endHour += 12;
                  if (endPeriod === 'am' && endHour === 12) endHour = 0;
                } else {
                  continue;
                }
              } else if (pattern.bothPM || pattern.bothAM) {
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
            
            // Extract times are assumed to be in EST (as per user requirement)
            // Always default to EST if no timezone specified
            let timezone = updatedEvent.timezone || 'America/New_York';
            
            // Get the date parts from the original event (preserve the date)
            // If year is not specified in the original event, assume current year
            let year: number;
            if (
              updatedEvent.startISO &&
              // Accepts YYYY-MM-DD or YYYY-MM-DDTHH
              !/^\d{4}-\d{2}-\d{2}/.test(updatedEvent.startISO)
            ) {
              // If not proper ISO, fallback to current year
              year = new Date().getFullYear();
            } else if (
              updatedEvent.startISO &&
              // If there is a year
              /^\d{4}/.test(updatedEvent.startISO)
            ) {
              year = startDate.getUTCFullYear();
            } else {
              year = new Date().getFullYear();
            }
            const month = startDate.getUTCMonth();
            const day = startDate.getUTCDate();
            
            // Create Date objects - convert from EST to UTC for storage
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const startTimeStr = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
            const endTimeStr = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
            
            const newStart = createDateFromTimezone(dateStr, startTimeStr, timezone);
            const newEnd = createDateFromTimezone(dateStr, endTimeStr, timezone);
            
            // If end time is earlier than start (e.g., 8pm wraps to next day), adjust
            if (newEnd <= newStart) {
              newEnd.setDate(newEnd.getDate() + 1);
            }
            
            updatedEvent = {
              ...updatedEvent,
              startISO: newStart.toISOString(),
              endISO: newEnd.toISOString(),
              timezone: timezone, // Preserve or set timezone
            };
          }
        }
        
        return updatedEvent;
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

