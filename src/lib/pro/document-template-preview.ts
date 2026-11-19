import {quotePrintHtml} from './round10-print';
import {invoicePrintHtml} from './invoice-print';
import {calculatePrivateEstimate,type PrivateEstimate} from './private-estimates';
import {invoiceAmounts,type EditableInvoiceLine} from './invoice-detail';
import type {InvoiceDraft} from './invoice-drafts';
/**
 * Round F1-C (row 45): sample documents for the preview of "Documentos con su marca". They go through
 * the same print templates and the same applyDocumentBranding as the real prints, so the preview shows
 * exactly what the chosen template does. Fixed example data only (no customer data, nothing stored).
 */
const STAMP='2026-11-19T15:00:00.000Z';
const ids=['5b0c8e52-6d3c-4d5e-9a51-0c0f6b8e0a01','5b0c8e52-6d3c-4d5e-9a51-0c0f6b8e0a02','5b0c8e52-6d3c-4d5e-9a51-0c0f6b8e0a03'];
export function sampleQuotePrintHtml(en:boolean){
 const t=(es:string,english:string)=>en?english:es;
 const lines=[
  {id:ids[0],description:t('Demolición de enchape existente','Removal of existing tiles'),unit:'m²',qtyMilli:18000,unitPriceCents:850000,discountBps:0,taxBps:1300,catalogProductId:null,group:t('Demolición','Demolition')},
  {id:ids[1],description:t('Enchape de pared, porcelanato 30 × 60','Wall tiling, 30 × 60 porcelain'),unit:'m²',qtyMilli:18000,unitPriceCents:1500000,discountBps:500,taxBps:1300,catalogProductId:null,group:t('Acabados','Finishes')},
  {id:ids[2],description:t('Mueble de lavatorio con sobre','Vanity cabinet with top'),unit:t('unid.','ea'),qtyMilli:1000,unitPriceCents:25000000,discountBps:0,taxBps:1300,catalogProductId:null,group:t('Acabados','Finishes')},
 ];
 const totals=calculatePrivateEstimate(lines);
 const estimate={kind:'private_estimate',id:ids[0],ownerId:ids[1],revision:1,status:'draft',clientId:'sample',client:{id:'sample',name:t('Cliente de ejemplo','Sample customer'),email:'',phone:'',identification:null,address:t('San José, Costa Rica','San José, Costa Rica'),tradeName:null},clientFingerprint:'0'.repeat(32),source:null,
  issuer:{issuerName:t('Su empresa','Your company'),issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:'',issuerActivity:''},title:t('Remodelación de baño (ejemplo)','Bathroom remodel (example)'),notes:t('Precios en colones. Incluye materiales y mano de obra.','Prices in colones. Includes materials and labour.'),currency:'CRC',validUntil:'2026-12-19',
  lines,subtotalCents:totals.subtotalCents,discountCents:totals.discountCents,taxCents:totals.taxCents,totalCents:totals.totalCents,createdAt:STAMP,updatedAt:STAMP} as unknown as PrivateEstimate;
 return quotePrintHtml(estimate,'preview',en,true);
}
function lineOf(description:string,cabys:string,quantity:string,unitPrice:string):EditableInvoiceLine{return {kind:'service',productId:null,sku:'',description,unit:'Sp',cabys,quantity,unitPrice,discountType:'percent',discount:'0',discountReason:'',tax:null,taxTreatment:'vat',taxRate:'13'};}
export function sampleInvoicePrintHtml(){
 const lines=[lineOf('Enchape de pared','4321000000000','18','15000'),lineOf('Instalación de mueble de lavatorio','4329900000000','1','250000')],amounts=invoiceAmounts(lines);
 const draft={id:'FAC-EJEMPLO',title:'Remodelación de baño (ejemplo)',receiver:{name:'Cliente de ejemplo',identification:'',email:'',phone:'',address:'San José'},preparation:{issuerName:'Su empresa',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:'',issuerActivity:'',plannedDate:'2026-11-30',saleCondition:'cash',paymentMethod:'transfer'},
  editedDetail:{lines},lines:[],charges:[],totalCents:amounts.totalCents,taxCents:amounts.taxCents,notes:'Gracias por su confianza.'} as unknown as InvoiceDraft;
 return invoicePrintHtml(draft,'preview');
}
