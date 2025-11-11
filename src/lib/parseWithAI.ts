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
};

export async function parseWithAI(inputText: string): Promise<ParseResult> {
  const preferLocalRule = import.meta.env.VITE_AI_PARSE_MODE === 'local';
  if (preferLocalRule) {
    return {
      events: fallbackHeuristic(inputText),
      method: 'fallback',
      reason: 'VITE_AI_PARSE_MODE is set to "local"',
    };
  }

  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    return {
      events: fallbackHeuristic(inputText),
      method: 'fallback',
      reason: 'VITE_GEMINI_API_KEY is not set',
    };
  }

  const model = import.meta.env.VITE_GEMINI_MODEL || 'gemini-1.5-flash';
  const prompt = `Extract calendar events from the following text. Return a JSON object of shape {"events": [ ... ]}.
Each event must include:
- title (string)
- description (string optional)
- location (string optional)
- startISO (ISO 8601 string in UTC)
- endISO (ISO 8601 string in UTC)
- timezone (IANA tz optional)

Text:\n${inputText}`;

  try {
    // Use v1beta endpoint (standard for Gemini API)
    // Model names: gemini-1.5-flash, gemini-1.5-pro, gemini-pro
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    
    console.log(`Calling Gemini API with model: ${model}`);
    
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
        },
      }),
    });

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
        userFriendlyReason = `Model "${model}" not found. Check if the model name is correct. Try: gemini-1.5-flash, gemini-1.5-pro, or gemini-pro`;
      } else if (resp.status === 401 || resp.status === 403) {
        userFriendlyReason = `API key invalid or missing permissions. Check your VITE_GEMINI_API_KEY in .env file and ensure the Gemini API is enabled in Google Cloud Console.`;
      } else if (resp.status === 400) {
        userFriendlyReason = `Bad request: ${errorMessage || errorDetails}. Check your API key format and model name.`;
      } else {
        userFriendlyReason = `API error (${resp.status}): ${errorMessage || errorDetails}`;
      }
      
      return {
        events: fallbackHeuristic(inputText),
        method: 'fallback',
        reason: userFriendlyReason,
        model,
      };
    }
    
    const data = await resp.json();
    const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return {
        events: fallbackHeuristic(inputText),
        method: 'fallback',
        reason: 'No text response from Gemini API',
        model,
      };
    }

    // Create a JSON object from the text
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return {
        events: fallbackHeuristic(inputText),
        method: 'fallback',
        reason: 'Failed to parse JSON response from Gemini',
        model,
      };
    }

    // (Safely) Extract the events array from the JSON object
    const arr = Array.isArray(json?.events) ? json.events : Array.isArray(json) ? json : [];
    const parsed: ParsedEvent[] = [];
    for (const item of arr) {
      const res = ParsedEventSchema.safeParse(item);
      if (res.success) parsed.push(res.data);
    }
    
    if (parsed.length === 0) {
      return {
        events: fallbackHeuristic(inputText),
        method: 'fallback',
        reason: 'No valid events found in Gemini response',
        model,
      };
    }
    
    return {
      events: parsed,
      method: 'gemini',
      model,
    };
  } catch (error: any) {
    return {
      events: fallbackHeuristic(inputText),
      method: 'fallback',
      reason: `Error calling Gemini API: ${error?.message || 'Unknown error'}`,
      model,
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

