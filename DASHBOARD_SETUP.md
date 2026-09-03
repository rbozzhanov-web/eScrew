# Dashboard Schedule Parser - Usage Guide

## Overview

eScrew now supports importing schedules from the Airastana AIMS Dashboard endpoint (`/eCrew/Dashboard`) in addition to the traditional SchedulerEvents endpoint. Both endpoints are fully supported and can be used interchangeably.

## Quick Start

### Prerequisites

✅ **You must be logged in to AIMS**
- Visit: https://aims.airastana.com/ecrew
- Sign in with your crew credentials
- You should see your schedule or dashboard

### Option 1: Using the Extended Connector (Recommended)

1. **Open eScrew** - Have the app ready
2. **Visit connector**: `public/aims-connector-extended.html` (in new window/tab)
3. **Choose endpoint**:
   - **SchedulerEvents** - Traditional, well-tested endpoint (default)
   - **Dashboard** - Alternative endpoint for schedule data
4. **Copy bookmark code** - Tap the button
5. **Create Safari bookmark** with the copied code
6. **Back in AIMS** - Already logged in at step 1
7. **Run the bookmark** - Tap it when viewing your schedule
8. **Wait for confirmation** - "✓ Roster ready" should appear
9. **Send to eScrew** - Tap the button
10. **Done!** - Roster appears in eScrew

### Option 2: Using Separate Connectors

**For SchedulerEvents (Original):**
- Visit: `public/aims-connector.html`
- Follow the setup instructions

**For Dashboard (New):**
- Use the extended connector and select Dashboard option

## How It Works

### Import Flow (Step by Step)

```
1. Open AIMS (https://aims.airastana.com/ecrew) → Sign in
2. Navigate to Schedule/Dashboard page in AIMS
3. Open eScrew app in another window
4. Copy AIMS bookmark from connector
5. Create bookmark in Safari
6. Run bookmark from AIMS page
7. Wait for "✓ Roster ready" message
8. Tap "Send to eScrew"
9. Roster appears in eScrew ✓
```

### What Happens Behind the Scenes

1. **Bookmarklet runs** in your authenticated AIMS session
2. **Fetches schedule data** from your chosen endpoint
3. **Validates the data** format
4. **Sends to eScrew** via secure window messaging
5. **eScrew normalizes** the data to internal format
6. **Schedule updates** in your app

## Endpoint Comparison

### SchedulerEvents (`/eCrew/CrewSchedule/SchedulerEvents`)
- **Status**: Recommended, well-tested
- **Format**: Complex event objects with detailed flight information
- **Crew Support**: Yes, can be enriched with crew sheet data
- **Use When**: Primary schedule source preferred

### Dashboard (`/eCrew/Dashboard`)
- **Status**: Supported, alternative source
- **Format**: Clean, simple event structure
- **Crew Support**: Not yet implemented
- **Use When**: Different schedule view or fallback option

## Features

### Supported Data

Both endpoints extract:
- ✅ Flight dates
- ✅ Flight numbers
- ✅ Airport codes (origin/destination)
- ✅ Departure and arrival times
- ✅ Report times
- ✅ Aircraft types
- ✅ Roster period dates

### Coming Soon

- Crew member information
- Absence events (SICK, VAC, CHLD, UFF)
- Actual flight times
- Deadhead flights
- Crew enrichment from additional sources

## Troubleshooting

### "Run this bookmark inside AIMS"
- Make sure you're in https://aims.airastana.com
- Check that you're logged in to AIMS

### "Unsupported roster response"
- The endpoint returned data in an unexpected format
- Try the other endpoint (SchedulerEvents or Dashboard)
- Check AIMS is displaying schedule data correctly

### "Could not read roster"
- Network error - check your internet connection
- Try again or use the other endpoint
- Use the Diagnostic Tool to see what data AIMS is sending

### "Could not send roster"
- eScrew window was closed or lost connection
- Try again by opening eScrew first, then running bookmark
- Check browser security settings allow window communication

### Roster appears empty

If you see the roster imported but no flights appear:
1. Check AIMS shows flights for the selected period
2. Use the Diagnostic Tool to verify API response
3. Try with the other endpoint

## Diagnostic Tools

### API Response Monitor
To monitor what data AIMS is sending:

1. Open: `public/aims-dashboard-diagnostic.html` in your browser
2. Keep it open while using the bookmarklet
3. The tool shows all API responses in real-time
4. You can download the captured data as JSON

This is useful for:
- Verifying endpoint responses
- Debugging format issues
- Reporting problems to developers
- Understanding data structure

### Endpoint Debugger (For 404 Errors)
If you get "404 Not Found" or "Could not read roster" errors:

1. Open: `public/aims-debug-endpoints.html` **in the authenticated AIMS page** (not in eScrew)
2. The tool will check your AIMS instance for available endpoints
3. Click "Test [Endpoint]" to test specific paths
4. Click "Scan All Paths" to find which endpoints work on your AIMS
5. Note which paths return status 200 (working) vs 404 (not found)

This helps identify:
- Which API endpoints exist on your AIMS instance
- Whether the paths have changed
- The correct endpoint for your version of AIMS
- Response structure and data format

**Common reasons for 404:**
- Your AIMS instance doesn't have the Dashboard endpoint
- The endpoint path is different on your server
- You're not logged in (run debugger while authenticated)
- Using a different AIMS version with different endpoints

## Security Notes

✅ **Safe to use:**
- No passwords stored or transmitted
- No credentials captured
- Uses same-origin policy
- All data stays private
- No accounts created in eScrew

❌ **Never happens:**
- eScrew sees authentication tokens
- Login credentials sent to eScrew
- Session cookies captured
- Personal data stored online

## Manual Import (Advanced)

If the bookmarklet doesn't work:

1. Visit: `public/aims-connector-extended.html`
2. Scroll to "Manual Paste" tab
3. In AIMS, open Developer Tools
4. Copy the JSON response from the API call
5. Paste into the textarea
6. Click "Validate JSON"
7. Manually import to eScrew

## Tips & Tricks

### Using Multiple Rosters

You can import multiple rosters:
- Each import adds to your roster library
- You can view any period you've imported
- Older rosters are preserved

### Switching Endpoints

If one endpoint doesn't work for you:
1. Go back to the connector
2. Select the other endpoint
3. Copy the new bookmark
4. Try again

### Mobile Considerations

- **iOS**: Copy bookmark into Safari, share to bookmark
- **iPad**: Same as iPhone, use split view if available
- **Android**: Use with web browser supporting bookmarklets
- **Desktop**: Works same as mobile

### Keeping It Updated

- The bookmarklet doesn't need updates
- If endpoints change, we'll update the connector
- Check GitHub for latest version

## Reporting Issues

If you encounter problems:

1. Use the Diagnostic Tool to capture API responses
2. Check the error message in the UI
3. Note the endpoint you were using
4. Check GitHub issues for similar reports
5. Report with diagnostic data if needed

## API Details

For developers interested in the internal format:

### SchedulerEvents Response
```json
{
  "PeriodStart": "2024-09-01",
  "PeriodEnd": "2024-09-30",
  "RosterDateTime": "2024-09-03T12:30:00Z",
  "SchedulerEvents": [
    {
      "start": "2024-09-05T09:00:00",
      "end": "2024-09-05T18:00:00",
      "type": "Flight",
      "details": "101 - ALA (1030) - NUR (1215)",
      ...
    }
  ]
}
```

### Dashboard Response
```json
{
  "periodStart": "2024-09-01",
  "periodEnd": "2024-09-30",
  "rosterDateTime": "2024-09-03T12:30:00Z",
  "events": [
    {
      "date": "2024-09-05",
      "flightNumber": "101",
      "origin": "ALA",
      "destination": "NUR",
      "departure": "10:30",
      "arrival": "12:15",
      ...
    }
  ]
}
```

### Normalized Internal Format
Both endpoints convert to a common internal format:
```typescript
{
  period: { start: string, end: string },
  duties: [
    {
      date: string,
      flights: [
        {
          flightNumber: string,
          date: string,
          origin: string,
          destination: string,
          departure: string,
          arrival: string,
          ...
        }
      ]
    }
  ]
}
```

## Support

For more information:
- See `src/aims/dashboard.md` for technical documentation
- See `src/aims/INTEGRATION.md` for architecture details
- Check `public/aims-dashboard-diagnostic.html` for monitoring tools
- Visit `public/aims-connector-extended.html` for import interface
