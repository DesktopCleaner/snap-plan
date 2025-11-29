## SnapPlan

### Convenience, Convenience, Convenience

I am too lazy to manually create calendar events :)

So I created SnapPlan is a web application that lets you quickly create multiple calendar events from photos/text. It automatically extracts and parses the event details using Gemini AI, then add them to your associated Google Calendar.

✅ Highlights:
- Record ALL possible details from the input
- Descriptive tags for your events
- Google Calendar integration

## Features

- 📷 **Camera Capture** - Take photos directly from your device (testing)
- 📁 **Bulk Upload** - Upload multiple images at once for batch processing
- 📝 **Text Input** - Paste or type event information directly (testing)
- 🤖 **Gemini-Powered Parsing** - Uses free gemini models to intelligently extract event details
- 📅 **Google Calendar Integration** - Create events directly in your associated Google Calendar
- 🍕 **Descriptive Tags** - Get #Free Food and #Registration Status tags for your events
- 🗂️ **Separate Calendar Category** - Events created in separate category for clarity
- 📥 **ICS Export** - Download events as `.ics` files for calendar apps of your choice

## Architecture

This application consists of:
- **Frontend**: React + Vite
- **Backend**: Node.js/Express server (handles API keys securely)
- **Deployment**: Vercel (frontend + serverless functions)

## Prerequisites

- Node.js 18+
- Google Cloud OAuth 2.0 Client (Web application)
- Google Gemini API Key

## Try it out!

https://uwsnapplan.vercel.app/
(The snapplan domain is taken I know..)

## Features in Detail

### Bulk Upload
- Upload multiple images at once
- Each image is processed sequentially
- All events from all images are collected and displayed together
- Progress indicator shows processing status

### AI Parsing
- Uses Google Gemini AI for event extraction (OCR)
- Handles various date/time formats
- Supports timezone conversion (defaults to EST)
- Detects all-day events
- Falls back to heuristic parsing if AI is unavailable
- Generate descriptive tags at the front of description

### Event Editing
- Edit event details before creating in calendar
- Change timezone display
- Modify title, description, location, dates, and times
- Toggle all-day event status

## Troubleshooting

### Cannot Log-in to Google account
- Currently in Testing, will be supported to all users in stable release.

## AI Parsing Error
- Since we are using free gemini models, it may take some trials to get the event correctly generated.


### In the Future:
- 🎤 **Voice input**
- 🏛️ **UW customized features** (eg. identifing clubs/organizations, campus navigation)
- 🔁 **Event sharing!**


## License


## Contributing

