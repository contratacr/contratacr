import {test,expect} from 'playwright/test';
import {unzipSync,strFromU8} from 'fflate';
import {xlsxFromRows} from '../../src/lib/pro/xlsx-lite';
import {taskRowsMatrix} from '../../src/lib/pro/task-center-detail';

// Row 15: XLSX export of task rows. Valid package, escaped XML, text-only cells (formulas never evaluate), bilingual headers.
test('xlsx package has the required parts and the rows in order',()=>{
 const files=unzipSync(xlsxFromRows([['A','B'],['1','dos']],'Tareas'));
 expect(Object.keys(files).sort()).toEqual(['[Content_Types].xml','_rels/.rels','xl/_rels/workbook.xml.rels','xl/styles.xml','xl/workbook.xml','xl/worksheets/sheet1.xml']);
 const sheet=strFromU8(files['xl/worksheets/sheet1.xml']!);
 expect(sheet).toContain('r="A1"');expect(sheet).toContain('r="B2"');expect(sheet.indexOf('>A<')).toBeLessThan(sheet.indexOf('>dos<'));
 expect(strFromU8(files['xl/workbook.xml']!)).toContain('name="Tareas"');
});
test('formulas and markup are stored as text, never as a formula or XML',()=>{
 const sheet=strFromU8(unzipSync(xlsxFromRows([['h'],['=HYPERLINK("http://x","y")'],['<b>&"x"\u0001']],'S'))['xl/worksheets/sheet1.xml']!);
 expect(sheet).not.toContain('<f>');expect(sheet).toContain('t="inlineStr"');
 expect(sheet).toContain('&lt;b&gt;&amp;&quot;x&quot;');expect(sheet).not.toContain('\u0001');expect(sheet).toContain('=HYPERLINK(&quot;');
});
test('sheet name drops forbidden characters and is limited to 31',()=>{
 const wb=strFromU8(unzipSync(xlsxFromRows([['a']],'Mis/tareas:'+'x'.repeat(40)))['xl/workbook.xml']!);
 const n=/name="([^"]+)"/.exec(wb)![1]!;expect(n.length).toBeLessThanOrEqual(31);expect(n).not.toMatch(/[/:]/);
});
test('headers follow the language',()=>{
 const r=[{title:'T',job:'J',customer:'C',dueDate:null,status:'done' as const,assignee:'A'}];
 expect(taskRowsMatrix(r,false)[0]![0]).toBe('Tarea');expect(taskRowsMatrix(r,true)[0]![0]).toBe('Task');
 expect(taskRowsMatrix(r,false)[1]![4]).toBe('Completada');expect(taskRowsMatrix(r,true)[1]![4]).toBe('Completed');
});
