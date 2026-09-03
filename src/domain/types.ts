export type CrewRole = 'Cabin' | 'Flight deck';

export type CrewMember = {
  id: string;
  name: string;
  role: CrewRole;
  position?: string;
  rosterRank?: string;
  deadhead?: boolean;
};

export type Sector = {
  id: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  departureTime: string;
  arrivalTime: string;
  blockMinutes: number;
  crew: CrewMember[];
  deadhead?: boolean;
  actualTimes?: boolean;
};

export type Duty = {
  id: string;
  date?: string;
  reportDate?: string;
  releaseDate?: string;
  dateLabel: string;
  reportTime: string;
  releaseTime: string;
  sectors: Sector[];
  layoverStation?: string;
};
