/**
 * Client for backend AIMS Parser API
 * Replaces browser-based parsing with server-side extraction
 */

import type { NormalizedRoster, NormalizedFlight, NormalizedCrewMember } from '@/src/core/rosterContract';

interface ApiScheduleResponse {
  status: 'success' | 'error';
  flights?: Flight[];
  error?: string;
  last_update?: string;
}

interface Flight {
  flight_id: string;
  flight_number: string;
  date: string;
  departure_time: string;
  arrival_time: string;
  departure_airport: string;
  arrival_airport: string;
  aircraft_type: string;
  registration?: string;
  crew: ApiCrewMember[];
}

interface ApiCrewMember {
  name: string;
  position: string;
  id?: string;
}

export class AimsApiClient {
  private baseUrl: string;
  private username: string;
  private password: string;

  constructor(
    baseUrl: string = 'http://localhost:8000',
    username: string,
    password: string
  ) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
  }

  /**
   * Fetch schedule from backend parser and convert to NormalizedRoster
   */
  async getRoster(startDate: string, endDate: string): Promise<NormalizedRoster> {
    const response = await this.fetchSchedule(startDate, endDate);

    if (!response.flights) {
      throw new Error('No flights in response');
    }

    // Convert API response to NormalizedRoster
    const duties = this.convertFlightsToRoster(response.flights, startDate, endDate);

    return {
      period: {
        start: startDate,
        end: endDate
      },
      duties
    };
  }

  /**
   * Fetch raw schedule from backend API
   */
  private async fetchSchedule(
    startDate: string,
    endDate: string
  ): Promise<ApiScheduleResponse> {
    const response = await fetch(`${this.baseUrl}/api/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: this.username,
        password: this.password,
        start_date: startDate,
        end_date: endDate,
        use_cache: true
      })
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Convert API flights to NormalizedRoster duties
   */
  private convertFlightsToRoster(
    flights: Flight[],
    startDate: string,
    endDate: string
  ): NormalizedDuty[] {
    const flightsByDate = new Map<string, NormalizedFlight[]>();

    for (const flight of flights) {
      if (!flightsByDate.has(flight.date)) {
        flightsByDate.set(flight.date, []);
      }

      const normalizedFlight: NormalizedFlight = {
        flightNumber: flight.flight_number,
        date: flight.date,
        origin: flight.departure_airport,
        destination: flight.arrival_airport,
        departure: flight.departure_time,
        arrival: flight.arrival_time,
        aircraftType: flight.aircraft_type,
        crew: flight.crew.map((member) => this.convertCrewMember(member))
      };

      flightsByDate.get(flight.date)!.push(normalizedFlight);
    }

    // Create duties from flights
    const duties: NormalizedDuty[] = [];
    const dates = Array.from(flightsByDate.keys()).sort();

    for (const date of dates) {
      const flightsForDate = flightsByDate.get(date)!;
      if (flightsForDate.length > 0) {
        duties.push({
          date,
          flights: flightsForDate
        });
      }
    }

    return duties;
  }

  /**
   * Convert API crew member to normalized format
   */
  private convertCrewMember(member: ApiCrewMember): NormalizedCrewMember {
    const position = member.position.toUpperCase();

    // Determine role (Flight deck vs Cabin)
    let role: NormalizedCrewRole = 'Cabin';
    if (
      ['CAPT', 'CAPTAIN', 'FO', 'FIRST OFFICER', 'TRI', 'TRE'].includes(position)
    ) {
      role = 'Flight deck';
    }

    return {
      id: member.id,
      name: member.name,
      role,
      position: member.position
    };
  }

  /**
   * Test authentication
   */
  async testAuth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password
        })
      });

      const data = await response.json();
      return data.authenticated === true;
    } catch {
      return false;
    }
  }

  /**
   * Check API health
   */
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export async function createAimsApiClient(
  baseUrl: string,
  username: string,
  password: string
): Promise<AimsApiClient> {
  const client = new AimsApiClient(baseUrl, username, password);

  // Verify API is reachable
  if (!(await client.isHealthy())) {
    throw new Error('AIMS Parser API is not reachable');
  }

  // Verify credentials work
  if (!(await client.testAuth())) {
    throw new Error('Authentication failed - check credentials');
  }

  return client;
}
