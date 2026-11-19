import {test,expect} from 'playwright/test';
import {quoteValidUntil} from '../../src/lib/quote-validity';

test('Quote validity follows Costa Rica calendar across UTC and local midnight',()=>{
 const cases:[string,number,string][]=[
  ['2026-11-03T23:59:59.999Z',15,'2026-11-18'],
  ['2026-11-04T00:00:00.000Z',15,'2026-11-18'],
  ['2026-11-04T05:59:59.999Z',15,'2026-11-18'],
  ['2026-11-04T06:00:00.000Z',15,'2026-11-19'],
  ['2024-02-29T05:59:59.999Z',1,'2024-02-29'],
  ['2024-02-29T06:00:00.000Z',1,'2024-03-01'],
  ['2026-01-01T05:59:59.999Z',1,'2026-01-01'],
  ['2026-01-01T06:00:00.000Z',1,'2026-01-02'],
  ['2026-11-04T01:00:00.000Z',90,'2027-02-01'],
 ];
 for(const [instant,days,expected] of cases)expect(quoteValidUntil(days,Date.parse(instant)),`${instant} + ${days} days`).toBe(expected);
});
