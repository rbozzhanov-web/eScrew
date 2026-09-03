# AIMS Schedule Parser Integration Guide

## Overview

The eScrew application integrates with Airastana AIMS to import crew schedules through two supported endpoints:

1. **SchedulerEvents** (Recommended) - `/eCrew/CrewSchedule/SchedulerEvents`
2. **Dashboard** - `/eCrew/Dashboard`

Both endpoints are automatically supported in the application through a unified bridge system.

## Architecture

```
AIMS Page (Bookmarklet)
    ↓
    Validates response format
    ↓
postMessage to eScrew
    ↓
Bridge (bridge.ts)
    ├─ parseAimsMessage()
    ├─ isAimsBridgeMessage() or isAimsDashboardBridgeMessage()
    ├─ adaptAimsSchedulerResponse() or adaptDashboardResponse()
    ↓
Adapter (adapter.ts)
    ├─ Converts to NormalizedRoster
    ├─ Extracts flights and duties
    ↓
Application
    ├─ importNormalizedRoster()
    ├─ Updates local storage
    ├─ Updates UI
    ↓
MainScreen.tsx
    └─ Displays schedule
```

## Message Types

### SchedulerEvents Message
```typescript
{
  type: 'escrow:aims-roster',
  payload: {
    PeriodStart: '2024-09-01',
    PeriodEnd: '2024-09-30',
    SchedulerEvents: [
      {
        start: '2024-09-05T09:00:00',
        end: '2024-09-05T18:00:00',
        type: 'Flight',
        details: '101 - ALA (1030) - NUR (1215)',
        // ...
      }
    ]
  }
}
```

### Dashboard Message
```typescript
{
  type: 'escrew:aims-dashboard',
  payload: {
    periodStart: '2024-09-01',
    periodEnd: '2024-09-30',
    events: [
      {
        date: '2024-09-05',
        flightNumber: '101',
        origin: 'ALA',
        destination: 'NUR',
        departure: '10:30',
        arrival: '12:15',
        // ...
      }
    ]
  }
}
```

## Component Flow

### 1. User Interaction
- User taps "A" button in eScrew to open AIMS
- User navigates to schedule in AIMS
- User runs AIMS bookmark

### 2. Bookmarklet Execution
- Runs inside authenticated AIMS page (same-origin)
- Fetches schedule data from chosen endpoint
- Validates response format
- Shows UI with "Roster ready" status
- Posts message to eScrew window

### 3. Message Reception
- MainScreen.tsx listens via `listenForAimsRoster()`
- Bridge validates message origin and format
- Message is parsed to NormalizedRoster
- Application imports normalized data

### 4. Data Storage
- NormalizedRoster is stored in local app storage
- UI updates automatically
- Previous rosters remain available

## Adding Support for New Endpoints

To add support for a new AIMS endpoint:

1. **Create a parser** (`src/aims/newEndpointParser.ts`):
```typescript
export interface NewEndpointResponse {
  periodStart: string;
  periodEnd: string;
  events: EventType[];
}

export function parseNewEndpoint(data: unknown): AimsExtractedRoster | undefined {
  // Parse and normalize
}
```

2. **Add extraction function** (`src/aims/extraction.ts`):
```typescript
export function extractNewEndpointResponse(observed: AimsObservedResponse): NewEndpointResponse | undefined {
  if (observed.path !== NEW_ENDPOINT_PATH) return undefined;
  // Extract and validate
}
```

3. **Add bridge message type** (`src/aims/bridge.ts`):
```typescript
export interface NewEndpointBridgeMessage {
  type: 'escrew:aims-new-endpoint';
  payload: NewEndpointResponse;
}

export function isNewEndpointBridgeMessage(value: unknown): value is NewEndpointBridgeMessage {
  // Validate
}
```

4. **Update parseAimsMessage()** in bridge.ts to handle the new type

5. **Create a bookmarklet** in connector HTML

## Security Considerations

All parsers follow these security principles:

- ✅ **Same-origin validation**: Messages must originate from `https://aims.airastana.com`
- ✅ **No credential capture**: Never read cookies, tokens, or authentication material
- ✅ **Type validation**: All data is validated against expected schemas
- ✅ **Sanitization boundary**: Only sanitized data crosses into the application
- ✅ **No storage**: Authentication data is never stored or transmitted

## Debugging

### Using the Diagnostic Tool
Visit `public/aims-dashboard-diagnostic.html` to monitor all AIMS API calls:
```bash
# Serve the diagnostic HTML and visit in AIMS
```

### Enabling Debug Logging
The parsers include validation that logs errors:
```typescript
// In bridge.ts, parseAimsMessage catches and handles errors
```

### Testing with Manual JSON
The connector allows pasting raw JSON responses for validation without going through the full import flow.

## Testing

### Unit Testing
No unit tests currently exist but can be added for:
- Parser validation functions
- Adapter normalization functions
- Message type guards

### Integration Testing
Manual testing in development:
1. Open AIMS in a test browser
2. Open eScrew in another window
3. Run bookmarklet from AIMS
4. Verify roster appears in eScrew

### CI/CD
The project includes TypeScript type checking which validates:
- Type correctness across all parsers
- Message structure validity
- Adapter function signatures

## Troubleshooting

### "Unsupported roster response"
The response format doesn't match expected schema. Check:
- Response has required fields (periodStart, periodEnd, events/SchedulerEvents)
- Data types are correct (strings for dates, arrays for events)
- Endpoint path is correct in bookmarklet

### "Could not send roster"
The AIMS window lost connection to eScrew window:
- Ensure eScrew was opened from within AIMS bookmark click
- Check browser window/tab settings allow cross-window messaging
- Verify same-origin policy allows `https://rbozzhanov-web.github.io`

### Message not received in eScrew
- Verify bookmarklet ran successfully (UI appeared and said "✓ Roster ready")
- Check browser console for cross-origin errors
- Ensure eScrew window is from GitHub Pages (https://rbozzhanov-web.github.io)
- Try the diagnostic tool to verify API response format

## Future Enhancements

Potential improvements:
- Add crew member parsing to Dashboard endpoint
- Support crew sheet enrichment for both endpoints
- Add absent events (SICK, VAC, etc.) to Dashboard parser
- Implement incremental roster updates
- Add network error retry logic
- Support for multiple schedule sources in one import
