import {test,expect} from 'playwright/test';
import {buildLeadImportCsv,guessLeadImportColumn,leadImportMappingValid,parseLeadImportCsv,type LeadImportMapping} from '../../src/lib/pro/lead-inboxes';
import {parseCatalogCsv} from '../../src/lib/pro/catalog-import';

// Leads area: manual column mapping of the CSV import (pure parts: guess, validation, rebuilt CSV that the server parser accepts).
const file='Cliente;Mail;Teléfono;Trabajo;Notas;Zona\r\n"Ana ""la jefa"" Mora";ana@example.test;8888-1111;Pintura;Llamar mañana;Heredia\r\nBeto;;8777-2222;Techos;;Alajuela';
test('import mapping: guesses known headers and leaves the rest for the person',()=>{
 const header=parseCatalogCsv(file)[0];
 expect(header.map(guessLeadImportColumn)).toEqual(['name',null,'phone',null,'description',null]);
 expect(guessLeadImportColumn('  Tipo de Proyecto ')).toBe('projectType');expect(guessLeadImportColumn('Correo electrónico')).toBe('email');expect(guessLeadImportColumn('zzz')).toBeNull();
});
test('import mapping: validation and rebuilt CSV round trip through the server parser',()=>{
 const table=parseCatalogCsv(file),map:LeadImportMapping=['name','email','phone','service','description',null];
 expect(leadImportMappingValid(map)).toBe(true);
 expect(leadImportMappingValid(['name','email','phone',null,null,null])).toBe(false);
 expect(leadImportMappingValid(['name','email','email','service',null,null])).toBe(false);
 expect(leadImportMappingValid(['name',null,null,'service',null,null])).toBe(false);
 const rows=parseLeadImportCsv(buildLeadImportCsv(table,map));
 expect(rows).toHaveLength(2);
 expect(rows[0]).toMatchObject({name:'Ana "la jefa" Mora',email:'ana@example.test',phone:'8888-1111',service:'Pintura',description:'Llamar mañana',address:''});
 expect(rows[1]).toMatchObject({name:'Beto',email:'',phone:'8777-2222',service:'Techos'});
});
