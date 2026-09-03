/**
 * Examples of using the Dashboard Schedule Parser
 *
 * This file demonstrates various ways to use the Dashboard parser
 * to extract schedule information from the AIMS Dashboard API.
 */

import { AimsExtractionEngine } from './engine';
import { parseDashboardResponse, type DashboardRosterResponse } from './dashboardParser';
import type { AimsExtractedRoster } from './types';

/**
 * Example 1: Reading dashboard schedule from authenticated AIMS page
 *
 * This method should only be called from within an already-authenticated
 * AIMS page (e.g., from a bookmarklet or browser extension).
 */
export async function example1_readFromEngine(): Promise<AimsExtractedRoster> {
  const engine = new AimsExtractionEngine();
  const roster = await engine.readDashboard();

  console.log('Roster period:', roster.periodStart, 'to', roster.periodEnd);
  console.log('Number of flights:', roster.flights.length);

  return roster;
}

/**
 * Example 2: Parsing a Dashboard API response directly
 *
 * Useful when you already have the JSON response and want to parse it.
 */
export function example2_parseResponse(): AimsExtractedRoster | undefined {
  const apiResponse: DashboardRosterResponse = {
    periodStart: '2024-09-01',
    periodEnd: '2024-09-30',
    rosterDateTime: '2024-09-03T12:30:00Z',
    events: [
      {
        date: '2024-09-05',
        flightNumber: 'KC101',
        origin: 'ALA',
        destination: 'NUR',
        departure: '10:30',
        arrival: '12:15',
        report: '09:30',
        aircraftType: 'A320',
        legId: 'KC101-20240905-ALA-NUR',
        type: 'flight',
      },
      {
        date: '2024-09-06',
        flightNumber: 'KC215',
        origin: 'NUR',
        destination: 'UUS',
        departure: '14:45',
        arrival: '16:30',
        report: '13:45',
        aircraftType: 'A319',
        legId: 'KC215-20240906-NUR-UUS',
        type: 'flight',
      },
    ],
  };

  const roster = parseDashboardResponse(apiResponse);
  if (!roster) {
    console.error('Failed to parse dashboard response');
    return undefined;
  }

  // Display parsed flights
  roster.flights.forEach(flight => {
    console.log(`${flight.date} - ${flight.flightNumber}: ${flight.origin} → ${flight.destination}`);
  });

  return roster;
}

/**
 * Example 3: Processing dashboard data with error handling
 *
 * Shows how to handle errors and invalid data gracefully.
 */
export async function example3_withErrorHandling() {
  const engine = new AimsExtractionEngine();

  try {
    const roster = await engine.readDashboard();

    // Validate the roster
    if (!roster.periodStart || !roster.periodEnd) {
      console.error('Invalid roster: missing period information');
      return;
    }

    if (roster.flights.length === 0) {
      console.log('No flights found in roster');
      return;
    }

    // Process flights
    roster.flights.forEach((flight, index) => {
      console.log(`Flight ${index + 1}:`);
      console.log(`  Date: ${flight.date}`);
      console.log(`  Number: ${flight.flightNumber || 'N/A'}`);
      console.log(`  Route: ${flight.origin || '?'} → ${flight.destination || '?'}`);
      console.log(`  Departure: ${flight.departure || 'N/A'}`);
      console.log(`  Arrival: ${flight.arrival || 'N/A'}`);
    });
  } catch (error) {
    console.error('Failed to read dashboard:', error instanceof Error ? error.message : String(error));
  }
}

/**
 * Example 4: Comparing SchedulerEvents and Dashboard endpoints
 *
 * Shows how to use both endpoints and compare their data.
 */
export async function example4_compareEndpoints(): Promise<{
  schedulerEvents: AimsExtractedRoster;
  dashboard: AimsExtractedRoster;
}> {
  const engine = new AimsExtractionEngine();

  try {
    const [schedulerEvents, dashboard] = await Promise.all([engine.readRoster(), engine.readDashboard()]);

    console.log('SchedulerEvents flights:', schedulerEvents.flights.length);
    console.log('Dashboard flights:', dashboard.flights.length);

    // Compare flight counts
    if (schedulerEvents.flights.length !== dashboard.flights.length) {
      console.warn('Flight counts differ between endpoints');
    }

    return { schedulerEvents, dashboard };
  } catch (error) {
    throw new Error(`Failed to read from both endpoints: ${error}`);
  }
}

/**
 * Example 5: Formatting roster for display
 *
 * Shows how to format the parsed roster data for user display.
 */
export function example5_formatForDisplay(roster: AimsExtractedRoster): string {
  let output = '';

  output += `Roster Period: ${roster.periodStart} to ${roster.periodEnd}\n`;
  if (roster.rosterDateTime) {
    output += `Generated: ${roster.rosterDateTime}\n`;
  }
  output += `Total Flights: ${roster.flights.length}\n\n`;

  output += 'Flights:\n';
  output += '─'.repeat(80) + '\n';

  roster.flights.forEach((flight, index) => {
    output += `${index + 1}. `;
    output += `${flight.date} | `;
    output += `${flight.flightNumber || 'N/A'} | `;
    output += `${flight.origin || '?'} → ${flight.destination || '?'} | `;
    output += `${flight.departure || '??:??'} - ${flight.arrival || '??:??'}`;
    if (flight.report) {
      output += ` | Report: ${flight.report}`;
    }
    output += '\n';
  });

  return output;
}

// Export for use in other modules
export type { AimsExtractedRoster };
