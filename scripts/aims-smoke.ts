import { strict as assert } from 'node:assert';
import { parseAimsSchedulerResponse } from '../src/aims/adapter';

const roster = parseAimsSchedulerResponse({
  PeriodStart: '2026-08-01',
  PeriodEnd: '2026-08-31',
  SchedulerEvents: [
    {
      start: '2026-08-03T00:00:00',
      end: '2026-08-03T23:59:59',
      type: 'Off',
      text: 'OFF\r\nDay Off',
    },
    {
      start: '2026-08-08T23:15:00',
      end: '2026-08-09T10:59:00',
      type: 'Flight',
      text: 'F909\r\nALA-ICN',
      details: 'F909\r\nReporting time : 2315\r\n909 - ALA (A0046⁺¹) - ICN (A1029⁺¹)\r\nDebriefing time : 1059⁺¹',
      IsDeadhead: false,
    },
    {
      start: '2026-08-12T00:00:00',
      end: '2026-08-12T23:59:59',
      type: 'Default',
      text: 'SICK\r\nSick leave',
    },
  ],
});

assert.deepEqual(roster.period, { start: '2026-08-01', end: '2026-08-31' });
assert.equal(roster.duties.length, 1);
assert.deepEqual(roster.duties[0], {
  index: 0,
  start: '2026-08-08T23:15',
  end: '2026-08-09T10:59',
  sectorCount: 1,
});
assert.deepEqual(roster.sectors[0], {
  flightNumber: '909',
  date: '2026-08-09',
  departureAirport: 'ALA',
  arrivalAirport: 'ICN',
  timeOut: '00:46',
  timeIn: '10:29',
  deadhead: false,
  actualTimes: true,
  dutyIndex: 0,
  dutySectorIndex: 1,
});
assert.deepEqual(roster.absences, [{ code: 'SICK', date: '2026-08-12' }]);

console.log('AIMS adapter smoke test passed');
