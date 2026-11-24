import {test,expect} from 'playwright/test';
import {documentCode,nextSort,sanitizeColumns,sortRows,toggleColumn} from '../../src/lib/pro/finance-table';

// Area D: unit checks (no browser, no server) of the table view helpers: sorting, column picker, document codes.
const all=['title','recipient','status','total'];
test('Sorting: numbers, Spanish text, empty values last in both directions',()=>{
 const rows=[{n:'Zeta',v:5},{n:'álamo',v:null},{n:'Beta',v:20},{n:'Casa 10',v:1},{n:'Casa 2',v:undefined}];
 expect(sortRows(rows,r=>r.v,'asc').map(r=>r.n)).toEqual(['Casa 10','Zeta','Beta','álamo','Casa 2']);
 expect(sortRows(rows,r=>r.v,'desc').map(r=>r.n)).toEqual(['Beta','Zeta','Casa 10','álamo','Casa 2']);
 expect(sortRows(rows,r=>r.n,'asc').map(r=>r.n)).toEqual(['álamo','Beta','Casa 2','Casa 10','Zeta']);
 expect(rows.map(r=>r.n)[0]).toBe('Zeta');
});
test('Sort header cycles ascending then descending and restarts on another column',()=>{
 const first=nextSort(null,'total');expect(first).toEqual({key:'total',direction:'asc'});
 const second=nextSort(first,'total');expect(second).toEqual({key:'total',direction:'desc'});
 expect(nextSort(second,'total')).toEqual({key:'total',direction:'asc'});
 expect(nextSort(second,'status')).toEqual({key:'status',direction:'asc'});
});
test('Column picker keeps the title and table order',()=>{
 expect(toggleColumn(all,all,'status')).toEqual(['title','recipient','total']);
 expect(toggleColumn(['title','total'],all,'recipient')).toEqual(['title','recipient','total']);
 expect(toggleColumn(['title','total'],all,'title')).toEqual(['title','total']);
 expect(toggleColumn(all,all,'unknown')).toEqual(all);
 expect(sanitizeColumns(null,all,['title','total'])).toEqual(['title','total']);
 expect(sanitizeColumns(['total','x',4,'recipient'],all,all)).toEqual(['title','recipient','total']);
 expect(sanitizeColumns('bad',all,all)).toEqual(all);
});
test('Document codes are stable, short and uppercase',()=>{
 expect(documentCode('FAC','3f9a1c22-0000-4000-8000-000000000000')).toBe('FAC-3F9A1C');
 expect(documentCode('COT','3f9a1c22-0000-4000-8000-000000000000')).toBe(documentCode('COT','3f9a1c22-0000-4000-8000-000000000000'));
});
