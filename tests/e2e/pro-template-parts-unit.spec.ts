import {test,expect} from 'playwright/test';
import {templatePartCount} from '../../src/lib/pro/template-parts';

// Area D: unit check (no browser, no server) of the "number of parts" shown for each template in the Templates hub.
test('Part count of every template kind',()=>{
 expect(templatePartCount({recordCount:7})).toBe(7);
 expect(templatePartCount({count:12})).toBe(12);
 expect(templatePartCount({phaseCount:2,taskCount:10,milestoneCount:3})).toBe(15);
 expect(templatePartCount({lines:[{},{},{}]})).toBe(3);
 expect(templatePartCount({recordCount:0,count:5})).toBe(0);
 expect(templatePartCount({})).toBeUndefined();
 expect(templatePartCount({phaseCount:2})).toBeUndefined();
});
