import {test,expect} from 'playwright/test';
import {colonesToCents,normalizeQuantityInput,parseQuantity,quantityToInput} from '../../src/lib/pro/allowances';
import {parsePoQuantity} from '../../src/lib/pro/purchase-orders';

// es-CR groups thousands with «.»: a quantity typed as «1.000» must mean one
// thousand, exactly like «₡1.000» in the price next to it, and edit values must
// never be shown with padding zeros or a decimal mark that reads as grouping.
test('quantities: one grouping rule per language, no ambiguous edit values',()=>{
 expect(colonesToCents('1.000')).toBe(100000);
 expect(parsePoQuantity('1.000',false)).toBe(1000);expect(parsePoQuantity('12.500,5',false)).toBe(12500.5);expect(parsePoQuantity('1,5',false)).toBe(1.5);expect(parsePoQuantity('1.5',false)).toBe(1.5);expect(parsePoQuantity('12,125',false)).toBe(12.125);
 expect(parsePoQuantity('1,000',true)).toBe(1000);expect(parsePoQuantity('1.000',true)).toBe(1);expect(parsePoQuantity('2.125',true)).toBe(2.125);expect(parsePoQuantity('1,5',true)).toBe(1.5);
 expect(parsePoQuantity('0',false)).toBeNull();expect(parsePoQuantity('1.0000',false)).toBeNull();expect(parsePoQuantity('abc',true)).toBeNull();
 expect(parseQuantity('1.000',false)).toBe(1000);expect(parseQuantity('2,25',false)).toBe(2.25);expect(parseQuantity('2.25',true)).toBe(2.25);expect(parseQuantity('2,250',true)).toBe(2250);
 expect(normalizeQuantityInput(' 1 000 ',false)).toBe('1000');
 for(const [value,es,en] of [[1,'1','1'],[1.5,'1,5','1.5'],[12.5,'12,5','12.5'],[1000,'1000','1000'],[2.125,'2,125','2.125']] as const){
  expect(quantityToInput(value,false)).toBe(es);expect(quantityToInput(value,true)).toBe(en);
  // Round trip: what the form shows parses back to the same quantity.
  expect(parsePoQuantity(quantityToInput(value,false),false)).toBe(value);expect(parsePoQuantity(quantityToInput(value,true),true)).toBe(value);
 }
});
