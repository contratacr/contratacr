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

test('Pro entitlement preserves admin role and denies inactive disabled banned or expired accounts',async()=>{
 const {hasProAccess}=await import('../../src/lib/pro/access');
 expect(hasProAccess({role:'admin'},null,false)).toBe(true);
 expect(hasProAccess({role:'admin',is_disabled:true},null,false)).toBe(false);
 expect(hasProAccess({role:'professional'},null,false)).toBeFalsy();
 expect(hasProAccess({role:'professional'},{status:'active',expires_at:null},false)).toBe(true);
 expect(hasProAccess({role:'client'},{status:'active',expires_at:null},false)).toBe(false);
 expect(hasProAccess({role:'client',is_provider:true},{status:'active',expires_at:null},false)).toBe(true);
 expect(hasProAccess({role:'client'},{status:'inactive',expires_at:null},false)).toBe(false);
 expect(hasProAccess({role:'client'},{status:'active',expires_at:'2026-01-01'},false,Date.parse('2026-10-23'))).toBe(false);
 expect(hasProAccess({role:'client'},{status:'active',expires_at:'invalid'},false)).toBe(false);
 // Mirrors SQL pro_entitled: a banned/suspended professional is refused even with an active grant or admin role,
 // and a caller that could not read the ban flag must not pass false.
 expect(hasProAccess({role:'professional'},{status:'active',expires_at:null},true)).toBe(false);
 expect(hasProAccess({role:'client',is_provider:true},{status:'active',expires_at:null},true)).toBe(false);
 expect(hasProAccess({role:'admin'},null,true)).toBe(false);
 expect(hasProAccess({role:'professional'},{status:'active',expires_at:null},null as unknown as boolean)).toBe(false);
});
