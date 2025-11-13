import { useState, useEffect } from 'react';
import type { ParsedEvent } from '../lib/parseWithAI';

type Props = {
  event: ParsedEvent;
  index: number;
  total: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: ParsedEvent) => void;
};

export default function EventEditModal({ event, index, total, isOpen, onClose, onSave }: Props) {
  const [editedEvent, setEditedEvent] = useState<ParsedEvent>(event);
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');

  // Initialize form fields from ISO strings
  useEffect(() => {
    if (event) {
      const start = new Date(event.startISO);
      const end = new Date(event.endISO);

      // Use local time for display/editing (better UX)
      // Format date as YYYY-MM-DD for date input (using local date)
      const startYear = start.getFullYear();
      const startMonth = String(start.getMonth() + 1).padStart(2, '0');
      const startDay = String(start.getDate()).padStart(2, '0');
      setStartDate(`${startYear}-${startMonth}-${startDay}`);

      const endYear = end.getFullYear();
      const endMonth = String(end.getMonth() + 1).padStart(2, '0');
      const endDay = String(end.getDate()).padStart(2, '0');
      setEndDate(`${endYear}-${endMonth}-${endDay}`);

      // Format time as HH:mm for time input (using local time)
      const startHours = String(start.getHours()).padStart(2, '0');
      const startMinutes = String(start.getMinutes()).padStart(2, '0');
      setStartTime(`${startHours}:${startMinutes}`);

      const endHours = String(end.getHours()).padStart(2, '0');
      const endMinutes = String(end.getMinutes()).padStart(2, '0');
      setEndTime(`${endHours}:${endMinutes}`);

      setEditedEvent(event);
    }
  }, [event]);

  if (!isOpen) return null;

  const handleSave = () => {
    // Combine date and time - treat as local time, then convert to UTC for ISO
    // Create date objects in local timezone
    const startLocal = new Date(`${startDate}T${startTime}:00`);
    const endLocal = new Date(`${endDate}T${endTime}:00`);

    // Convert to ISO strings (which are in UTC)
    const updated: ParsedEvent = {
      ...editedEvent,
      startISO: startLocal.toISOString(),
      endISO: endLocal.toISOString(),
    };

    onSave(updated);
    onClose();
  };

  const handleCancel = () => {
    // Reset to original event
    const start = new Date(event.startISO);
    const end = new Date(event.endISO);
    
    const startYear = start.getFullYear();
    const startMonth = String(start.getMonth() + 1).padStart(2, '0');
    const startDay = String(start.getDate()).padStart(2, '0');
    setStartDate(`${startYear}-${startMonth}-${startDay}`);

    const endYear = end.getFullYear();
    const endMonth = String(end.getMonth() + 1).padStart(2, '0');
    const endDay = String(end.getDate()).padStart(2, '0');
    setEndDate(`${endYear}-${endMonth}-${endDay}`);

    const startHours = String(start.getHours()).padStart(2, '0');
    const startMinutes = String(start.getMinutes()).padStart(2, '0');
    setStartTime(`${startHours}:${startMinutes}`);
    
    const endHours = String(end.getHours()).padStart(2, '0');
    const endMinutes = String(end.getMinutes()).padStart(2, '0');
    setEndTime(`${endHours}:${endMinutes}`);
    
    setEditedEvent(event);
    onClose();
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

          {/* Start Date/Time */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Start Date & Time *
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
            </div>
          </div>

          {/* End Date/Time */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              End Date & Time *
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
            </div>
          </div>

          {/* Timezone */}
          <div>
            <label style={{ display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
              Timezone
            </label>
            <input
              type="text"
              value={editedEvent.timezone || ''}
              onChange={(e) => setEditedEvent({ ...editedEvent, timezone: e.target.value })}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px',
              }}
              placeholder="e.g., America/New_York, Europe/London (optional)"
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              Leave empty to use UTC. Use IANA timezone format.
            </div>
          </div>
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

