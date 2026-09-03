import type { NormalizedRoster } from '@/src/core/rosterContract';
import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';

const KEY='escrew.rosters.v1';
const sort=(r:ParsedAirAstanaRoster[])=>[...r].sort((a,b)=>a.period.start.localeCompare(b.period.start));

export function loadStoredRosters():ParsedAirAstanaRoster[]{if(typeof localStorage==='undefined')return[];try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?sort(v):[]}catch{return[]}}

/**
 * Application compatibility boundary while the existing roster UI still uses
 * ParsedAirAstanaRoster. Source-specific DTOs must already have been adapted to
 * NormalizedRoster before reaching this function.
 */
export function upsertStoredRoster(roster:ParsedAirAstanaRoster|NormalizedRoster){const stored=toStoredRoster(roster);const next=sort([...loadStoredRosters().filter(x=>x.period.start!==stored.period.start),stored]);if(typeof localStorage!=='undefined')localStorage.setItem(KEY,JSON.stringify(next));return next}
export function removeStoredRoster(start:string){const next=loadStoredRosters().filter(x=>x.period.start!==start);if(typeof localStorage!=='undefined')localStorage.setItem(KEY,JSON.stringify(next));return next}
export function clearStoredRosters(){if(typeof localStorage!=='undefined')localStorage.removeItem(KEY)}

function toStoredRoster(roster:ParsedAirAstanaRoster|NormalizedRoster):ParsedAirAstanaRoster{
  if('sectors' in roster)return roster;
  const sectors:ParsedAirAstanaRoster['sectors']=[];
  const duties:ParsedAirAstanaRoster['duties']=[];
  for(const duty of roster.duties){
    const dutyIndex=duties.length;
    duties.push({index:dutyIndex,start:duty.start,end:duty.end,sectorCount:duty.flights.length});
    duty.flights.forEach((flight,index)=>sectors.push({
      flightNumber:flight.flightNumber,
      date:flight.date,
      departureAirport:flight.origin,
      arrivalAirport:flight.destination,
      timeOut:flight.departure,
      timeIn:flight.arrival,
      arrivalDate:flight.arrivalDate,
      aircraftType:flight.aircraftType,
      deadhead:Boolean(flight.deadhead),
      actualTimes:Boolean(flight.actualTimes),
      dutyIndex,
      dutySectorIndex:index+1,
    }));
  }
  return {period:roster.period,totals:{},sectors,duties,absences:roster.absences??[],crewRecords:[],unreadCells:[]};
}
