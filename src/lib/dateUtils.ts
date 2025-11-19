// Utility functions for date formatting in EST

const DEFAULT_TIMEZONE = 'America/New_York'; // EST/EDT

/**
 * Format a date in EST timezone
 */
export function formatDateInEST(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    ...options,
  });
}

/**
 * Format a date string in EST timezone
 */
export function formatDateStringInEST(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  return formatDateInEST(new Date(dateString), options);
}

/**
 * Get date components in EST timezone
 */
export function getDateComponentsInEST(date: Date | string): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(dateObj);
  const getPart = (type: string) => {
    const part = parts.find(p => p.type === type);
    return part ? parseInt(part.value) : 0;
  };
  
  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hours: getPart('hour'),
    minutes: getPart('minute'),
    seconds: getPart('second'),
  };
}

/**
 * Create a date string in EST timezone format (YYYY-MM-DD)
 */
export function getDateStringInEST(date: Date | string): string {
  const { year, month, day } = getDateComponentsInEST(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Create a time string in EST timezone format (HH:mm)
 */
export function getTimeStringInEST(date: Date | string): string {
  const { hours, minutes } = getDateComponentsInEST(date);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Convert a datetime from one timezone to EST, then to UTC
 * @param dateStr Date string in format YYYY-MM-DD
 * @param timeStr Time string in format HH:mm
 * @param sourceTimezone Source timezone (e.g., 'America/Los_Angeles')
 * @returns Date object in UTC
 */
export function convertToESTThenUTC(dateStr: string, timeStr: string, sourceTimezone: string): Date {
  // Parse components
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  // Create ISO string
  const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  
  // Step 1: Convert from sourceTimezone to UTC
  const tempDate = new Date(isoStr + 'Z'); // Treat as UTC first
  const sourceStr = tempDate.toLocaleString('en-US', { 
    timeZone: sourceTimezone, 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit', 
    hour12: false 
  });
  const sourceDate = new Date(sourceStr);
  const sourceOffset = tempDate.getTime() - sourceDate.getTime();
  const utcFromSource = new Date(tempDate.getTime() + sourceOffset);
  
  // Step 2: Now we have the UTC time. When displayed in EST, it will show the EST equivalent
  // This is what we want - the EST equivalent of the source timezone time
  return utcFromSource;
}

/**
 * Create a Date object from EST date/time strings
 * Assumes the date/time strings are in EST, then converts to UTC
 */
export function createDateFromEST(dateStr: string, timeStr: string): Date {
  // Parse the date and time components
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  // Create an ISO date string representing the time in EST
  const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  
  // We need to convert from EST to UTC
  // Strategy: Create a date in UTC that, when displayed in EST, shows the desired time
  const tempDate = new Date(isoStr + 'Z'); // Treat as UTC first
  
  // Get what this UTC time represents in EST
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const estParts = estFormatter.formatToParts(tempDate);
  const getESTPart = (type: string) => {
    const part = estParts.find(p => p.type === type);
    return part ? parseInt(part.value) : 0;
  };
  
  const estHour = getESTPart('hour');
  const estMinute = getESTPart('minute');
  
  // Calculate the offset: how much we need to adjust tempDate so it shows hours:minutes in EST
  const hourDiff = hours - estHour;
  const minuteDiff = minutes - estMinute;
  const totalMsDiff = (hourDiff * 60 + minuteDiff) * 60 * 1000;
  
  // Adjust the UTC date
  return new Date(tempDate.getTime() - totalMsDiff);
}

/**
 * Get date components in a specific timezone
 */
export function getDateComponentsInTimezone(date: Date | string, timezone: string): {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds: number;
} {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  const parts = formatter.formatToParts(dateObj);
  const getPart = (type: string) => {
    const part = parts.find(p => p.type === type);
    return part ? parseInt(part.value) : 0;
  };
  
  return {
    year: getPart('year'),
    month: getPart('month'),
    day: getPart('day'),
    hours: getPart('hour'),
    minutes: getPart('minute'),
    seconds: getPart('second'),
  };
}

/**
 * Format a date in a specific timezone
 */
export function formatDateInTimezone(date: Date | string, timezone: string, options?: Intl.DateTimeFormatOptions): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  return dateObj.toLocaleString('en-US', {
    timeZone: timezone,
    ...options,
  });
}

/**
 * Create a Date object from date/time strings in a specific timezone
 * Assumes the date/time strings are in the specified timezone, then converts to UTC
 */
export function createDateFromTimezone(dateStr: string, timeStr: string, timezone: string): Date {
  // Parse the date and time components
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  // Create a date string in ISO format (without timezone)
  const isoStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`;
  
  // Method: Use Intl.DateTimeFormat to find what UTC time corresponds to the local time in the timezone
  // We'll try different UTC times until we find one that displays as the desired local time
  
  // Start with a guess: assume the timezone offset is between -12 and +14 hours
  // We'll use a more direct approach: create a date in UTC, then adjust based on the timezone offset
  
  // Better approach: Use the fact that we can format a UTC date in the target timezone
  // and find the UTC time that gives us the desired local time
  
  // Create a UTC date that we'll adjust
  let testDate = new Date(isoStr + 'Z'); // Start with UTC interpretation
  
  // Get what this UTC time shows in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // Format the test date in the target timezone
  const parts = formatter.formatToParts(testDate);
  const getPart = (type: string) => {
    const part = parts.find(p => p.type === type);
    return part ? parseInt(part.value) : 0;
  };
  
  // const tzYear = getPart('year');
  // const tzMonth = getPart('month');
  const tzDay = getPart('day');
  const tzHour = getPart('hour');
  const tzMinute = getPart('minute');
  
  // Calculate the difference between what we want and what we got
  const hourDiff = hours - tzHour;
  const minuteDiff = minutes - tzMinute;
  
  // Also check if the date is different (timezone offset can cross midnight)
  const dayDiff = day - tzDay;
  
  // Adjust the UTC date by the difference
  // If we want 10:30 EST and the UTC date (10:30 UTC) shows 5:30 EST, 
  // we need to ADD 5 hours to get 15:30 UTC which shows as 10:30 EST
  const totalMsDiff = ((hourDiff + dayDiff * 24) * 60 + minuteDiff) * 60 * 1000;
  
  return new Date(testDate.getTime() + totalMsDiff);
}
