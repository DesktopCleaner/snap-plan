import { createEvents } from 'ics';

export type ParsedEvent = {
  title: string;
  description?: string;
  location?: string;
  startISO: string;
  endISO: string;
  timezone?: string;
};

export function toIcs(events: ParsedEvent[]): string {
  const icsEvents = events.map((e) => {
    const start = new Date(e.startISO);
    const end = new Date(e.endISO);
    return {
      title: e.title,
      description: e.description,
      location: e.location,
      start: [start.getFullYear(), start.getMonth() + 1, start.getDate(), start.getHours(), start.getMinutes()],
      end: [end.getFullYear(), end.getMonth() + 1, end.getDate(), end.getHours(), end.getMinutes()],
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

