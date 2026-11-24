import {test,expect} from 'playwright/test';
import {allowancesReconciliationHtml} from '../../src/lib/pro/round10-print';

// Row 75: reconciliation sheet (prints to PDF). Only chosen items, over/under subtotals, no internal notes, bilingual, escaped.
const item=(name:string,planned:number,actual:number|null,status:'open'|'decided')=>({id:crypto.randomUUID(),workId:'w',position:1,name,category:null,plannedCents:planned,dueDate:null,notes:'NOTA INTERNA',status,
 choice:actual===null?null:{description:'Opción <b>x</b>',supplier:'Prov',quantity:1,actualCents:actual,decidedAt:'2026-11-01T00:00:00Z'},
 differenceCents:actual===null?null:actual-planned,variance:actual===null?null:actual>planned?'over' as const:actual<planned?'under' as const:'equal' as const,overdue:false,changeId:null,archived:false,revision:1,createdAt:'2026-11-01T00:00:00Z',updatedAt:'2026-11-01T00:00:00Z'});
const data={service:'Cocina',client:'Ana',today:'2026-11-23',items:[item('Piso',100000,150000,'decided'),item('Grifería',80000,60000,'decided'),item('Pintura',50000,null,'open')],
 totals:{count:3,plannedCents:230000,decidedPlannedCents:180000,actualCents:210000,differenceCents:30000,projectedCents:0,decidedCount:2,pendingCount:1,overdueCount:0}};
test('reconciliation lists only chosen items with over, under and net',()=>{
 const html=allowancesReconciliationHtml(data as never,'n',false);
 expect(html).toContain('data-allowances-reconciliation-print');expect(html).toContain('Piso');expect(html).toContain('Grifería');expect(html).not.toContain('Pintura');
 expect(html).toContain('data-allowances-reconciliation-net="30000"');expect(html).not.toContain('NOTA INTERNA');expect(html).not.toContain('<b>x</b>');expect(html).toContain('Conciliación de montos previstos');
});
test('reconciliation in English and with nothing chosen',()=>{
 const en=allowancesReconciliationHtml(data as never,'n',true);expect(en).toContain('Allowance reconciliation');expect(en).toContain('Net difference');
 const none=allowancesReconciliationHtml({...data,items:[item('Pintura',50000,null,'open')]} as never,'n',true);expect(none).toContain('No chosen items yet.');expect(none).toContain('data-allowances-reconciliation-net="0"');
});
