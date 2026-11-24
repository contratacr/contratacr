import {test,expect} from 'playwright/test';
import {assemblyCostCents,itemKindMutationSchema,parseQtyMilli} from '../../src/lib/pro/catalog-kind';

// Area D: unit checks (no browser, no server) of the item kind payload and the assembly cost.
test('Quantities parse to thousandths and reject bad input',()=>{
 expect(parseQtyMilli('2')).toBe(2000);expect(parseQtyMilli('1,5')).toBe(1500);expect(parseQtyMilli(' 0.125 ')).toBe(125);
 for(const bad of ['','0','0.0004','-1','1.2345','abc','1e3','1.','1234567'])expect(parseQtyMilli(bad),bad).toBeNull();
});
test('Assembly cost is the sum of rounded part lines',()=>{
 expect(assemblyCostCents([])).toBe(0);
 expect(assemblyCostCents([{unitCostCents:2000000,qtyMilli:2000},{unitCostCents:333,qtyMilli:1500}])).toBe(4000000+500);
});
test('Mutation payload: only assemblies carry distinct parts, never itself',()=>{
 const base={productId:'a',revision:0};
 expect(itemKindMutationSchema.safeParse({...base,kind:'assembly',parts:[{partId:'b',qtyMilli:1000}]}).success).toBe(true);
 expect(itemKindMutationSchema.safeParse({...base,kind:'placeholder',parts:[]}).success).toBe(true);
 expect(itemKindMutationSchema.safeParse({...base,kind:'standard',parts:[{partId:'b',qtyMilli:1000}]}).success).toBe(false);
 expect(itemKindMutationSchema.safeParse({...base,kind:'assembly',parts:[{partId:'a',qtyMilli:1000}]}).success).toBe(false);
 expect(itemKindMutationSchema.safeParse({...base,kind:'assembly',parts:[{partId:'b',qtyMilli:1},{partId:'b',qtyMilli:2}]}).success).toBe(false);
 expect(itemKindMutationSchema.safeParse({...base,kind:'otro',parts:[]}).success).toBe(false);
 expect(itemKindMutationSchema.safeParse({...base,kind:'assembly',parts:[{partId:'b',qtyMilli:0}]}).success).toBe(false);
});
