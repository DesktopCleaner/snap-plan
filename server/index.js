import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import prisma from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env') });

// Get default model from environment variable
const defaultModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Config endpoint - provides non-sensitive config to frontend
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    geminiModel: process.env.GEMINI_MODEL || defaultModel,
    aiParseMode: process.env.AI_PARSE_MODE || '',
  });
});

// Helper function to call Gemini API
async function callGeminiAPI(apiKey, endpoint, modelName, parts) {
  const url = `https://generativelanguage.googleapis.com/${endpoint}/models/${modelName}:generateContent?key=${apiKey}`;
  
  const generationConfig = {
    temperature: 0.2,
  };
  
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        role: 'user',
        parts: parts,
      }],
      generationConfig: generationConfig,
    }),
  });
}

// Proxy endpoint for Gemini API
app.post('/api/gemini', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'GEMINI_API_KEY is not set in server environment variables' 
      });
    }

    const { model = defaultModel, prompt, imageData, mimeType } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Build parts for API call
    const parts = [{ text: prompt }];
    
    // Add image if provided
    if (imageData && mimeType) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
          data: imageData
        }
      });
    }

    // Try different models and endpoints in order of preference
    let resp = null;
    const modelsToTry = [
      model,
      'gemini-2.5-pro',
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-1.5-flash',
      'gemini-pro',
      'gemini-2.0-pro',
      'gemini-1.5-pro',
      'gemini-2.0-flash-lite',
      'gemini-2.0-flash-exp',
    ];
    
    const uniqueModels = [...new Set(modelsToTry)];
    const endpointsToTry = ['v1beta', 'v1'];
    
    for (const endpointToTry of endpointsToTry) {
      for (const modelToTry of uniqueModels) {
        console.log(`Trying model: "${modelToTry}" via ${endpointToTry}`);
        
        resp = await callGeminiAPI(apiKey, endpointToTry, modelToTry, parts);
        
        if (resp.ok) {
          console.log(`✅ Successfully connected to model: "${modelToTry}" via ${endpointToTry}`);
          const data = await resp.json();
          return res.json(data);
        }
        
        // If 404, try next model
        if (resp.status === 404) {
          console.warn(`Model "${modelToTry}" not found via ${endpointToTry}, trying next...`);
          continue;
        } else if (resp.status === 429) {
          // Quota error - try other models as they might have different quotas
          console.warn(`Model "${modelToTry}" quota exceeded (429) via ${endpointToTry}, trying next model...`);
          continue;
        } else if (resp.status === 401 || resp.status === 403) {
          // Auth errors - won't work with other models either, stop trying
          console.error(`Auth error (${resp.status}) for "${modelToTry}" via ${endpointToTry}, stopping model fallback`);
          break;
        } else {
          // Other errors - try next model (might be temporary issue or model-specific)
          console.warn(`Error ${resp.status} for "${modelToTry}" via ${endpointToTry}, trying next model...`);
          continue;
        }
      }
      
      // If we got a successful response, break out of endpoint loop
      if (resp && resp.ok) {
        break;
      }
    }
    
    // If all models failed, return error
    if (!resp) {
      return res.status(500).json({ 
        error: 'All Gemini models failed - no response received',
        details: 'Tried all available models and endpoints but received no response'
      });
    }
    
    let errorDetails = 'Unknown error';
    let errorMessage = '';
    
    try {
      const errorData = await resp.json();
      errorMessage = errorData?.error?.message || '';
      errorDetails = errorData?.error?.message || errorData?.error || `HTTP ${resp.status}`;
    } catch (e) {
      const text = await resp.text().catch(() => '');
      errorDetails = text || `HTTP ${resp.status} ${resp.statusText}`;
    }
    
    console.error('All Gemini models failed. Last error:', errorDetails);
    return res.status(resp.status).json({ 
      error: `Gemini API error: ${resp.status}`,
      details: errorDetails,
      message: errorMessage
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// ============================================
// Database API Endpoints for Events
// ============================================

// Create a new event
app.post('/api/events', async (req, res) => {
  try {
    const {
      title,
      description,
      location,
      startISO,
      endISO,
      timezone,
      allDay,
      userId,
      originalInput,
      inputType,
      extractedText,
    } = req.body;

    // Validate required fields
    if (!title || !startISO || !endISO) {
      return res.status(400).json({
        error: 'Missing required fields: title, startISO, and endISO are required'
      });
    }

    const event = await prisma.event.create({
      data: {
        title,
        description: description || null,
        location: location || null,
        startISO,
        endISO,
        timezone: timezone || null,
        allDay: allDay || false,
        userId: userId || null,
        originalInput: originalInput || null,
        inputType: inputType || null,
        extractedText: extractedText || null,
        syncedToGoogle: false,
        googleEventId: null,
      },
    });

    res.json(event);
  } catch (error) {
    console.error('Error creating event:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all events (optionally filtered by userId)
app.get('/api/events', async (req, res) => {
  try {
    const { userId } = req.query;
    
    const where = userId ? { userId } : {};
    
    const events = await prisma.event.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    res.json(events);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get a single event by ID
app.get('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    res.json(event);
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update an event
app.put('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      location,
      startISO,
      endISO,
      timezone,
      allDay,
      userId,
      googleEventId,
      syncedToGoogle,
    } = req.body;

    // Check if event exists
    const existingEvent = await prisma.event.findUnique({
      where: { id },
    });

    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Build update data (only include provided fields)
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (location !== undefined) updateData.location = location;
    if (startISO !== undefined) updateData.startISO = startISO;
    if (endISO !== undefined) updateData.endISO = endISO;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (allDay !== undefined) updateData.allDay = allDay;
    if (userId !== undefined) updateData.userId = userId;
    if (googleEventId !== undefined) updateData.googleEventId = googleEventId;
    if (syncedToGoogle !== undefined) updateData.syncedToGoogle = syncedToGoogle;

    const event = await prisma.event.update({
      where: { id },
      data: updateData,
    });

    res.json(event);
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete an event
app.delete('/api/events/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Check if event exists
    const existingEvent = await prisma.event.findUnique({
      where: { id },
    });

    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found' });
    }

    await prisma.event.delete({
      where: { id },
    });

    res.json({ success: true, message: 'Event deleted successfully' });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk create events (for multiple events from one input)
app.post('/api/events/bulk', async (req, res) => {
  try {
    const { events, userId, originalInput, inputType, extractedText } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events must be a non-empty array' });
    }

    // Validate all events have required fields
    for (const event of events) {
      if (!event.title || !event.startISO || !event.endISO) {
        return res.status(400).json({
          error: 'All events must have title, startISO, and endISO'
        });
      }
    }

    const createdEvents = await prisma.event.createMany({
      data: events.map(event => ({
        title: event.title,
        description: event.description || null,
        location: event.location || null,
        startISO: event.startISO,
        endISO: event.endISO,
        timezone: event.timezone || null,
        allDay: event.allDay || false,
        userId: userId || null,
        originalInput: originalInput || null,
        inputType: inputType || null,
        extractedText: extractedText || null,
        syncedToGoogle: false,
        googleEventId: null,
      })),
    });

    // Fetch the created events to return them
    const eventTitles = events.map(e => e.title);
    const fetchedEvents = await prisma.event.findMany({
      where: {
        title: { in: eventTitles },
        userId: userId || null,
      },
      orderBy: { createdAt: 'desc' },
      take: events.length,
    });

    res.json({
      count: createdEvents.count,
      events: fetchedEvents,
    });
  } catch (error) {
    console.error('Error creating bulk events:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
  console.log(`📝 Gemini API key: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`📝 Google Client ID: ${process.env.GOOGLE_CLIENT_ID ? '✅ Set' : '❌ Not set'}`);
  console.log(`📝 Gemini Model: ${process.env.GEMINI_MODEL || defaultModel}`);
});

