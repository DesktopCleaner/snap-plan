import type { ParsedEvent } from './parseWithAI';

export interface SavedEvent extends ParsedEvent {
  id: string;
  userId?: string;
  googleEventId?: string;
  syncedToGoogle: boolean;
  originalInput?: string;
  inputType?: 'image' | 'text';
  extractedText?: string;
  createdAt: string;
  updatedAt: string;
}

const getBackendUrl = () => {
  return import.meta.env.VITE_BACKEND_URL || 
         (import.meta.env.DEV ? 'http://localhost:3001' : '');
};

// Convert image blob to base64 for storage
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Save a single event to database
export async function saveEvent(
  event: ParsedEvent,
  options?: {
    userId?: string;
    originalInput?: Blob | string;
    inputType?: 'image' | 'text';
    extractedText?: string;
  }
): Promise<SavedEvent> {
  const backendUrl = getBackendUrl();
  
  let originalInput: string | undefined;
  if (options?.originalInput) {
    if (options.originalInput instanceof Blob) {
      originalInput = await blobToBase64(options.originalInput);
    } else {
      originalInput = options.originalInput;
    }
  }

  const response = await fetch(`${backendUrl}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...event,
      userId: options?.userId,
      originalInput,
      inputType: options?.inputType,
      extractedText: options?.extractedText,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to save event' }));
    throw new Error(error.error || 'Failed to save event');
  }

  return response.json();
}

// Save multiple events to database (bulk)
export async function saveEvents(
  events: ParsedEvent[],
  options?: {
    userId?: string;
    originalInput?: Blob | string;
    inputType?: 'image' | 'text';
    extractedText?: string;
  }
): Promise<{ count: number; events: SavedEvent[] }> {
  const backendUrl = getBackendUrl();
  
  let originalInput: string | undefined;
  if (options?.originalInput) {
    if (options.originalInput instanceof Blob) {
      originalInput = await blobToBase64(options.originalInput);
    } else {
      originalInput = options.originalInput;
    }
  }

  const response = await fetch(`${backendUrl}/api/events/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      events,
      userId: options?.userId,
      originalInput,
      inputType: options?.inputType,
      extractedText: options?.extractedText,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to save events' }));
    throw new Error(error.error || 'Failed to save events');
  }

  return response.json();
}

// Get all events
export async function getEvents(userId?: string): Promise<SavedEvent[]> {
  const backendUrl = getBackendUrl();
  const url = userId 
    ? `${backendUrl}/api/events?userId=${encodeURIComponent(userId)}`
    : `${backendUrl}/api/events`;

  const response = await fetch(url);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch events' }));
    throw new Error(error.error || 'Failed to fetch events');
  }

  return response.json();
}

// Get a single event by ID
export async function getEvent(id: string): Promise<SavedEvent> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/api/events/${id}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch event' }));
    throw new Error(error.error || 'Failed to fetch event');
  }

  return response.json();
}

// Update an event
export async function updateEvent(
  id: string,
  updates: Partial<ParsedEvent & { googleEventId?: string; syncedToGoogle?: boolean }>
): Promise<SavedEvent> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/api/events/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to update event' }));
    throw new Error(error.error || 'Failed to update event');
  }

  return response.json();
}

// Delete an event
export async function deleteEvent(id: string): Promise<void> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/api/events/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to delete event' }));
    throw new Error(error.error || 'Failed to delete event');
  }
}

