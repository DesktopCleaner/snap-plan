import { useState, useEffect } from 'react';
import type { ParsedEvent } from '../lib/parseWithAI';
import { getDateComponentsInTimezone, createDateFromTimezone } from '../lib/dateUtils';

type Props = {
  event: ParsedEvent;
  index: number;
  total: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: ParsedEvent) => void;
};

export default function EventEditModal({ event, index, total, isOpen, onClose, onSave }: Props) {
  const [editedEvent, setEditedEvent] = useState<ParsedEvent>({
    ...event,
    description: event.description || '',
  });
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [allDay, setAllDay] = useState(event.allDay || false);
  const [displayTimezone, setDisplayTimezone] = useState('America/New_York'); // Default to EST

  // Update form fields when event or displayTimezone changes
  useEffect(() => {
    if (event) {
      // Use displayTimezone for display/editing
      const startComponents = getDateComponentsInTimezone(event.startISO, displayTimezone);
      const endComponents = getDateComponentsInTimezone(event.endISO, displayTimezone);

      // Format date as YYYY-MM-DD for date input (using displayTimezone)
      setStartDate(`${startComponents.year}-${String(startComponents.month).padStart(2, '0')}-${String(startComponents.day).padStart(2, '0')}`);
      setEndDate(`${endComponents.year}-${String(endComponents.month).padStart(2, '0')}-${String(endComponents.day).padStart(2, '0')}`);

      // Format time as HH:mm for time input (using displayTimezone)
      setStartTime(`${String(startComponents.hours).padStart(2, '0')}:${String(startComponents.minutes).padStart(2, '0')}`);
      setEndTime(`${String(endComponents.hours).padStart(2, '0')}:${String(endComponents.minutes).padStart(2, '0')}`);

      setEditedEvent({
        ...event,
        description: event.description || '', // Ensure description is always a string
      });
      setAllDay(event.allDay || false);
    }
  }, [event, displayTimezone]);

  if (!isOpen) return null;

  const handleSave = () => {
    let updated: ParsedEvent;
    
    if (allDay) {
      // For all-day events, set to start and end of day in the display timezone
      // Convert to UTC for storage
      const startTz = createDateFromTimezone(startDate, '00:00', displayTimezone);
      const endTz = createDateFromTimezone(endDate, '23:59', displayTimezone);
      
      updated = {
        ...editedEvent,
        allDay: true,
        startISO: startTz.toISOString(),
        endISO: endTz.toISOString(),
      };
    } else {
      // For timed events, combine date and time (in displayTimezone)
      // Convert to UTC for storage
      const startTz = createDateFromTimezone(startDate, startTime, displayTimezone);
      const endTz = createDateFromTimezone(endDate, endTime, displayTimezone);

      updated = {
        ...editedEvent,
        allDay: false,
        startISO: startTz.toISOString(),
        endISO: endTz.toISOString(),
      };
    }

    onSave(updated);
    onClose();
  };

  const handleCancel = () => {
    // Reset to original event and EST timezone
    setDisplayTimezone('America/New_York');
    setEditedEvent(event);
    onClose();
  };
  
  const handleTimezoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTz = e.target.value.trim();
    if (newTz) {
      // Validate timezone by trying to format a date with it
      try {
        const testDate = new Date();
        testDate.toLocaleString('en-US', { timeZone: newTz });
        setDisplayTimezone(newTz);
      } catch (err) {
        // Invalid timezone, ignore
        console.warn('Invalid timezone:', newTz);
      }
    } else {
      // Empty string, reset to EST
      setDisplayTimezone('America/New_York');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '20px',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCancel();
        }
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0 }}>Edit Event {index + 1} of {total}</h2>
          <button
            onClick={handleCancel}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#666',
              padding: '0',
              width: '30px',
              height: '30px',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Title */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Title *
            </label>
            <input
              type="text"
              value={editedEvent.title}
              onChange={(e) => setEditedEvent({ ...editedEvent, title: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
              placeholder="Event title"
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Description
            </label>
            <textarea
              value={editedEvent.description || ''}
              onChange={(e) => setEditedEvent({ ...editedEvent, description: e.target.value })}
              rows={3}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
              placeholder="Event description"
            />
          </div>

          {/* Location */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Location
            </label>
            <input
              type="text"
              value={editedEvent.location || ''}
              onChange={(e) => setEditedEvent({ ...editedEvent, location: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
              placeholder="Event location"
            />
          </div>

          {/* All Day Checkbox */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
              />
              <span style={{ fontWeight: 'bold' }}>All Day Event</span>
            </label>
          </div>

          {/* Start Date/Time */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Start Date{allDay ? '' : ' & Time'} *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{
                  flex: '1',
                  minWidth: '150px',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
              {!allDay && (
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  style={{
                    flex: '1',
                    minWidth: '120px',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                />
              )}
            </div>
          </div>

          {/* End Date/Time */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              End Date{allDay ? '' : ' & Time'} *
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                style={{
                  flex: '1',
                  minWidth: '150px',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
              {!allDay && (
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  style={{
                    flex: '1',
                    minWidth: '120px',
                    padding: '8px',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    fontSize: '14px',
                  }}
                />
              )}
            </div>
          </div>

          {/* Timezone Selection */}
          {!allDay && (
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                Display Timezone
              </label>
              <input
                type="text"
                value={displayTimezone}
                onChange={handleTimezoneChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleTimezoneChange(e as any);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
                placeholder="e.g., America/New_York, UTC, America/Los_Angeles, Europe/London"
              />
              <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
                Times above are displayed in this timezone. Default is EST (America/New_York). Type a timezone and press Enter to convert.
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            onClick={handleCancel}
            style={{
              padding: '10px 20px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              backgroundColor: 'white',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!editedEvent.title.trim() || !startDate || !startTime || !endDate || !endTime}
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '4px',
              backgroundColor: '#4285f4',
              color: 'white',
              cursor: (!editedEvent.title.trim() || !startDate || !startTime || !endDate || !endTime) ? 'not-allowed' : 'pointer',
              opacity: (!editedEvent.title.trim() || !startDate || !startTime || !endDate || !endTime) ? 0.6 : 1,
              fontSize: '14px',
              fontWeight: 'bold',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

