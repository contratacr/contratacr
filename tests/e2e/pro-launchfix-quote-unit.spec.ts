import {test,expect} from 'playwright/test';
import {privateEstimateVisibleContent} from '../../src/lib/pro/private-estimate-publication-copy-recovery';
import {privateEstimateSamePublishedContent} from '../../src/lib/pro/private-estimate-publication-recovery';
import {calculatePrivateEstimate,type PrivateEstimate} from '../../src/lib/pro/private-estimates';

// Launch fix B1 (walkthrough 3, 2026-11-17): sharing a quote whose lines have sections («Demolición»,
// «Instalación») was published by the server but the browser never accepted the receipt: the expected
// content it compared against dropped line.group, so «Cambio de cotización pendiente» stayed forever
// and the one-time access code was never shown. No browser, no server, no network.
const line=(id:string,description:string,group?:string)=>({id,description,unit:'',qtyMilli:1000,unitPriceCents:35000000,discountBps:0,taxBps:1300,catalogProductId:null,...(group?{group}:{})});
function estimate(lines:ReturnType<typeof line>[]){
 const totals=calculatePrivateEstimate(lines);
 return {title:'Remodelación de cocina',currency:'CRC',validUntil:'2030-12-31',notes:'',issuer:{issuerName:'Constructora',issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:'',issuerActivity:''},
  client:{name:'María',tradeName:null,identification:null,address:null},lines,subtotalCents:totals.subtotalCents,discountCents:totals.discountCents,taxCents:totals.taxCents,totalCents:totals.totalCents} as unknown as PrivateEstimate;
}
const a='860b67a5-7d83-49ee-9254-b9f7c516600b',b='c45d6b95-a86f-465e-b489-8ea2caf308ef';

test('the expected published content keeps the section of every line',()=>{
 const content=privateEstimateVisibleContent(estimate([line(a,'Retiro de muebles','Demolición'),line(b,'Gabinetes','Instalación')]));
 expect(content.lines.map(l=>l.group)).toEqual(['Demolición','Instalación']);
 expect(JSON.stringify(content)).not.toContain('catalogProductId');
 // Lines without a section stay without the key (same shape the server publishes).
 expect('group' in privateEstimateVisibleContent(estimate([line(a,'Sin sección')])).lines[0]).toBe(false);
});

test('a grouped publication matches its expected content; a different document does not',()=>{
 const expected=privateEstimateVisibleContent(estimate([line(a,'Retiro de muebles','Demolición'),line(b,'Gabinetes','Instalación')]));
 const published=JSON.parse(JSON.stringify(expected));
 expect(privateEstimateSamePublishedContent(published,expected)).toBe(true);
 expect(privateEstimateSamePublishedContent({...published,title:'Otra'},expected)).toBe(false);
 expect(privateEstimateSamePublishedContent({...published,lines:[{...published.lines[0],group:'Otra sección'},published.lines[1]]},expected)).toBe(false);
});

test('a journal saved before the fix (no sections in the expected content) still recognises its grouped publication',()=>{
 const published=privateEstimateVisibleContent(estimate([line(a,'Retiro de muebles','Demolición'),line(b,'Gabinetes','Instalación')]));
 const legacy={...published,lines:published.lines.map(line=>{const copy={...line};delete copy.group;return copy;})};
 expect(privateEstimateSamePublishedContent(published,legacy)).toBe(true);
 // …but never a different document.
 const changed={...legacy,totalCents:legacy.totalCents+1};expect(privateEstimateSamePublishedContent(published,changed)).toBe(false);
 expect(privateEstimateSamePublishedContent(published,null)).toBe(false);
});
