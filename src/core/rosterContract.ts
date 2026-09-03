export type NormalizedCrewRole = 'Flight deck' | 'Cabin';

export interface NormalizedCrewMember {
  id?: string;
  name: string;
  role: NormalizedCrewRole;
  position?: string;
  deadhead?: boolean;
}

export interface NormalizedFlight {
  flightNumber: string;
  date: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  arrivalDate?: string;
  aircraftType?: string;
  deadhead?: boolean;
  actualTimes?: boolean;
  crew?: NormalizedCrewMember[];
}

export interface NormalizedDuty {
  date: string;
  start?: string;
  end?: string;
  flights: NormalizedFlight[];
}

export interface NormalizedAbsence {
  code: 'SICK' | 'UFF' | 'VAC' | 'CHLD';
  date: string;
}

export interface NormalizedRoster {
  period: { start: string; end: string };
  duties: NormalizedDuty[];
  absences?: NormalizedAbsence[];
}
