import {test,expect} from 'playwright/test';
import {estimateGroup,filterChanges,filterEstimates,summarizeChanges,summarizeEstimates,matchesText} from '../../src/lib/pro/finance-list';

// Area D: unit checks (no browser, no server) of the summary cards and filters shared by the money lists.
const est=(title:string,status:string,totalCents:number,currency='CRC',clientName='Ana')=>({title,status,totalCents,currency,clientName});
test('Quotes: groups, totals per currency and filters',()=>{
 const items=[est('Cocina','draft',100),est('Baño','sent',200),est('Techo','accepted',300),est('Pintura','declined',400),est('Piso','withdrawn',50),est('Verja USD','accepted',700,'USD','Luis')];
 expect(items.map(i=>estimateGroup(i.status))).toEqual(['draft','sent','accepted','closed','closed','accepted']);
 const s=summarizeEstimates(items);
 expect(s.counts).toEqual({all:6,draft:1,sent:1,accepted:2,closed:2});
 expect(s.total).toEqual({CRC:1050,USD:700});expect(s.accepted).toEqual({CRC:300,USD:700});expect(s.awaiting).toEqual({CRC:200});
 expect(filterEstimates(items,'closed','').map(i=>i.title)).toEqual(['Pintura','Piso']);
 expect(filterEstimates(items,'all','LUIS').map(i=>i.title)).toEqual(['Verja USD']);
 expect(filterEstimates(items,'accepted','techo').map(i=>i.title)).toEqual(['Techo']);
 expect(filterEstimates(items,'draft','techo')).toEqual([]);
});
test('Change orders: approved and awaiting totals, balance, filters',()=>{
 const items=[{status:'accepted',deltaCents:500,reason:'Extra electrico'},{status:'accepted',deltaCents:-100,reason:'Menos pintura'},{status:'proposed',deltaCents:900,reason:'Cielo raso'},{status:'declined',deltaCents:70,reason:'Jardin'},{status:'withdrawn',deltaCents:10,reason:'Otro'}];
 const s=summarizeChanges(items,2500);
 expect(s).toMatchObject({approved:400,awaiting:900,balance:2500,counts:{all:5,proposed:1,accepted:2,closed:2}});
 expect(summarizeChanges(items,null).balance).toBeNull();
 expect(filterChanges(items,'proposed','').map(i=>i.reason)).toEqual(['Cielo raso']);
 expect(filterChanges(items,'all','pintura').map(i=>i.reason)).toEqual(['Menos pintura']);
});
test('Text matching ignores case and empty fields',()=>{
 expect(matchesText(['Cocina',null,undefined],'')).toBe(true);
 expect(matchesText(['Cocina',null],'  COC ')).toBe(true);
 expect(matchesText([null,undefined],'x')).toBe(false);
});
