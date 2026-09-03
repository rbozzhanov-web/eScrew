# Dashboard Parser Documentation

## Overview

The Dashboard parser (`dashboardParser.ts`) provides support for extracting schedule data from the Airastana AIMS `/eCrew/Dashboard` endpoint.

## API Endpoint

- **Path**: `/eCrew/Dashboard`
- **Method**: `GET`
- **Credentials**: `same-origin`
- **Response Type**: JSON

## Response Format

The Dashboard API returns a JSON response with the following structure:

```typescript
interface DashboardRosterResponse {
  periodStart?: string;        // ISO date: YYYY-MM-DD
  periodEnd?: string;          // ISO date: YYYY-MM-DD
  rosterDateTime?: string;     // ISO datetime when roster was generated
  events?: DashboardScheduleEvent[];
}

interface DashboardScheduleEvent {
  date?: string;               // ISO date of the event
  flightNumber?: string;       // Flight number (e.g., "KC101")
  origin?: string;             // Airport code (e.g., "ALA")
  destination?: string;        // Airport code (e.g., "NUR")
  departure?: string;          // Departure time (HH:mm format)
  arrival?: string;            // Arrival time (HH:mm format)
  report?: string;             // Report time before flight
  aircraftType?: string;       // Aircraft type (e.g., "A320")
  legId?: string;              // Unique leg identifier
  status?: string;             // Event status
  type?: string;               // Event type (e.g., "flight")
}
```

## Usage

### Using AimsExtractionEngine

```typescript
import { AimsExtractionEngine } from '@/src/aims/engine';

const engine = new AimsExtractionEngine();

// Read dashboard schedule (must run inside authenticated AIMS page)
const roster = await engine.readDashboard();

// roster contains:
// {
//   periodStart: "2024-09-01",
//   periodEnd: "2024-09-30",
//   rosterDateTime?: "2024-09-03T12:30:00Z",
//   flights: [...]
// }
```

### Direct Parsing

```typescript
import { parseDashboardResponse } from '@/src/aims/dashboardParser';

const data = {
  periodStart: "2024-09-01",
  periodEnd: "2024-09-30",
  events: [
    {
      date: "2024-09-05",
      flightNumber: "KC101",
      origin: "ALA",
      destination: "NUR",
      departure: "10:30",
      arrival: "12:15",
      report: "09:30",
      aircraftType: "A320"
    }
  ]
};

const roster = parseDashboardResponse(data);
```

## Example Response

```json
{
  "periodStart": "2024-09-01",
  "periodEnd": "2024-09-30",
  "rosterDateTime": "2024-09-03T12:30:00Z",
  "events": [
    {
      "date": "2024-09-05",
      "flightNumber": "KC101",
      "origin": "ALA",
      "destination": "NUR",
      "departure": "10:30",
      "arrival": "12:15",
      "report": "09:30",
      "aircraftType": "A320",
      "legId": "KC101-20240905-ALA-NUR",
      "type": "flight"
    },
    {
      "date": "2024-09-06",
      "flightNumber": "KC215",
      "origin": "NUR",
      "destination": "UUS",
      "departure": "14:45",
      "arrival": "16:30",
      "report": "13:45",
      "aircraftType": "A319",
      "legId": "KC215-20240906-NUR-UUS",
      "type": "flight"
    }
  ]
}
```

## Features

- **Type Safety**: Full TypeScript support with proper types
- **Validation**: Validates required fields before processing
- **Normalization**: Converts Dashboard format to internal roster format
- **Error Handling**: Provides clear error messages for invalid data
- **Security**: Never captures authentication material, follows same-origin policy

## Integration with AIMS Bridge

The dashboard parser integrates with the existing AIMS extraction system:

1. `extraction.ts` - Validates and extracts the response
2. `dashboardParser.ts` - Parses Dashboard-specific format
3. `engine.ts` - Provides `readDashboard()` method for fetching

## Notes

- The parser is designed to work only within an already-authenticated AIMS page
- All times should be in HH:mm format (24-hour)
- Dates should be in ISO format (YYYY-MM-DD)
- The parser skips events with `type` values other than 'flight'
- Crew members can be enriched separately using `engine.enrichCrew()`
