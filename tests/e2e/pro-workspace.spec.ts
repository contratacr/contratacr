import {test,expect} from 'playwright/test';
import {validateWork,exportWork,type WorkItem,FREE_CAPABILITIES} from '../../src/lib/pro/workspace';
const item:WorkItem={id:'1',client:'Prueba',service:'Electricidad',stage:'scheduled',start:'2026-11-01T09:00:00-06:00',end:'2026-11-01T10:00:00-06:00'};
test('agenda rejects overlapping appointments but accepts adjacent slots',()=>{
 expect(validateWork({...item,id:'2'},[item])).toContain('Ya tiene');
 expect(validateWork({...item,id:'2',start:item.end,end:'2026-11-01T11:00:00-06:00'},[item])).toBeNull();
 expect(validateWork({...item,end:item.start},[])).not.toBeNull();
 expect(validateWork({...item,start:'',end:''},[])).not.toBeNull();
 expect(validateWork(item,[item])).toBeNull();
});
test('Excel export escapes formulas, quotes and preserves accented names',()=>{
 const csv=exportWork([{...item,client:' =SUM(1,1)',service:'Reparación "eléctrica"'}]);
 expect(csv.startsWith('\uFEFF')).toBe(true);
 expect(csv).toContain('"\' =SUM(1,1)"');
 expect(csv).toContain('"Reparación ""eléctrica"""');
});
test('ordinary contact and verification remain free',()=>{
 expect(FREE_CAPABILITIES).toEqual(['chat','whatsapp','phone','identity_verification']);
});

test('Pro entitlement preserves admin role and denies inactive disabled or expired accounts',async()=>{
 const {hasProAccess}=await import('../../src/lib/pro/access');
 expect(hasProAccess({role:'admin'},null)).toBe(true);
 expect(hasProAccess({role:'admin',is_disabled:true},null)).toBe(false);
 expect(hasProAccess({role:'professional'},null)).toBeFalsy();
 expect(hasProAccess({role:'professional'},{status:'active',expires_at:null})).toBe(true);
 expect(hasProAccess({role:'client'},{status:'inactive',expires_at:null})).toBe(false);
 expect(hasProAccess({role:'client'},{status:'active',expires_at:'2026-01-01'},Date.parse('2026-10-23'))).toBe(false);
 expect(hasProAccess({role:'client'},{status:'active',expires_at:'invalid'})).toBe(false);
});
