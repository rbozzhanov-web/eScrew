import type { ParsedAirAstanaRoster } from '@/src/import/parseAirAstanaRoster';
const KEY='escrew.rosters.v1';
const sort=(r:ParsedAirAstanaRoster[])=>[...r].sort((a,b)=>a.period.start.localeCompare(b.period.start));
export function loadStoredRosters():ParsedAirAstanaRoster[]{if(typeof localStorage==='undefined')return[];try{const v=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(v)?sort(v):[]}catch{return[]}}
export function upsertStoredRoster(roster:ParsedAirAstanaRoster){const next=sort([...loadStoredRosters().filter(x=>x.period.start!==roster.period.start),roster]);if(typeof localStorage!=='undefined')localStorage.setItem(KEY,JSON.stringify(next));return next}
export function removeStoredRoster(start:string){const next=loadStoredRosters().filter(x=>x.period.start!==start);if(typeof localStorage!=='undefined')localStorage.setItem(KEY,JSON.stringify(next));return next}
export function clearStoredRosters(){if(typeof localStorage!=='undefined')localStorage.removeItem(KEY)}
