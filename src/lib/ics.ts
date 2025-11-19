import { createEvents } from 'ics';

export type ParsedEvent = {
  title: string;
  description?: string;
  location?: string;
  startISO: string;
  endISO: string;
  timezone?: string;
  allDay?: boolean;
};

export function toIcs(events: ParsedEvent[]): string {
  const icsEvents = events.map((e) => {
    const start = new Date(e.startISO);
    const end = new Date(e.endISO);
    
    // For all-day events, use date-only format (no time) - use UTC methods since storage is UTC
    if (e.allDay) {
      return {
        title: e.title,
        description: e.description,
        location: e.location,
        start: [start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate()],
        end: [end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate()],
        startInputType: 'utc',
        endInputType: 'utc',
        calName: 'SnapPlan',
        productId: 'snapplan',
      } as const;
    }
    
    // For timed events, include time - use UTC methods since startISO/endISO are UTC
    return {
      title: e.title,
      description: e.description,
      location: e.location,
      start: [start.getUTCFullYear(), start.getUTCMonth() + 1, start.getUTCDate(), start.getUTCHours(), start.getUTCMinutes()],
      end: [end.getUTCFullYear(), end.getUTCMonth() + 1, end.getUTCDate(), end.getUTCHours(), end.getUTCMinutes()],
      startInputType: 'utc',
      endInputType: 'utc',
      calName: 'SnapPlan',
      productId: 'snapplan',
    } as const;
  });
  const { error, value } = createEvents(icsEvents as any);
  if (error) {
    throw error;
  }
  return value || '';
}

