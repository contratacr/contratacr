import {expect,test} from 'playwright/test';
import {distance,floorObjectCorners,floorPlanContentSchema,summarize} from '../../src/lib/pro/floor-plan';
import {floorTemplate,floorTemplateKeys,floorTemplateName} from '../../src/lib/pro/floor-templates';

// Row 15 - unit checks (no browser, server or database): the seven room templates are valid, closed, and everything fits inside.
test('Row 15: every template validates, has a door, and keeps openings and furniture inside the room',()=>{
 expect(floorTemplateKeys).toEqual(['kitchen','bathroom','living','bedroom','dining','office','closet']);
 for(const unit of ['m','ft'] as const)for(const key of floorTemplateKeys){
  const c=floorTemplate(key,unit,false);expect(floorPlanContentSchema.safeParse(c).success,key).toBe(true);
  expect(c.rooms).toHaveLength(1);expect(c.walls).toHaveLength(4);expect(c.openings.some(o=>o.kind==='door')).toBe(true);
  for(const o of c.openings){const w=c.walls.find(x=>x.id===o.wallId)!;expect(o.offset+o.width,key+' opening').toBeLessThanOrEqual(distance(w.a,w.b)+1e-6);}
  const xs=c.rooms[0]!.points.map(p=>p[0]),ys=c.rooms[0]!.points.map(p=>p[1]),[x0,x1,y0,y1]=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
  for(const o of c.objects??[])for(const [px,py] of floorObjectCorners(o)){expect(px,key+' '+o.kind).toBeGreaterThanOrEqual(x0-1e-6);expect(px).toBeLessThanOrEqual(x1+1e-6);expect(py).toBeGreaterThanOrEqual(y0-1e-6);expect(py).toBeLessThanOrEqual(y1+1e-6);}
  expect(summarize(c).totalArea).toBeGreaterThan(0);
 }
});
test('Row 15: names follow the language and feet scale the area',()=>{
 expect(floorTemplateName('kitchen',false)).toBe('Cocina');expect(floorTemplateName('kitchen',true)).toBe('Kitchen');expect(floorTemplate('bedroom','m',true).rooms[0]!.name).toBe('Bedroom');
 const m=summarize(floorTemplate('living','m',false)).totalArea,ft=summarize(floorTemplate('living','ft',false)).totalArea;expect(ft/m).toBeGreaterThan(10.7);expect(ft/m).toBeLessThan(10.8);
});
