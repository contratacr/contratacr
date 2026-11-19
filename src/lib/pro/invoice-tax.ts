import {z} from 'zod';
/** Ordinary draft VAT only. Hacienda v4.4, adjustments 22/04/2026, pp. 44–46, 72, 75, 83.
 * https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf
 * Retired/transitional tariffs and fiscal authorization checks are outside this draft model.
 */
export const VAT_OPTIONS=[
 {code:'01',rate:'0',label:'Tarifa 0 % (Artículo 32, num 1, RLIVA)'},
 {code:'02',rate:'1',label:'Tarifa reducida 1 %'},
 {code:'03',rate:'2',label:'Tarifa reducida 2 %'},
 {code:'04',rate:'4',label:'Tarifa reducida 4 %'},
 {code:'08',rate:'13',label:'Tarifa general 13 %'},
 {code:'09',rate:'0.5',label:'Tarifa reducida 0,5 %'},
 {code:'10',rate:'0',label:'Tarifa Exenta'},
 {code:'11',rate:'0',label:'Tarifa 0 % sin derecho a crédito'},
] as const;
const VAT_LABELS_EN:Record<string,string>={'01':'0% rate (Article 32, item 1, RLIVA)','02':'Reduced rate 1%','03':'Reduced rate 2%','04':'Reduced rate 4%','08':'General rate 13%','09':'Reduced rate 0.5%','10':'Exempt rate','11':'0% rate without credit right'};
/** Spanish keeps the catalog wording with a space before «%» («13 %», «0,5 %»); English «13%». */
export function vatOptionLabel(code:string,en:boolean){const option=VAT_OPTIONS.find(row=>row.code===code);return option?(en?VAT_LABELS_EN[option.code]??option.label:option.label):code;}
export const EXEMPTION_DOCUMENTS=[
 {code:'02',label:'Ventas exentas a diplomáticos'},
 {code:'03',label:'Autorizado por Ley especial'},
 {code:'04',label:'Exenciones Dirección General de Hacienda Autorización Local Genérica'},
 {code:'08',label:'Exoneración a Zona Franca'},
 {code:'09',label:'Exoneración de servicios complementarios para la exportación articulo 11 RLIVA'},
 {code:'10',label:'Órgano de las corporaciones municipales'},
 {code:'99',label:'Otros'},
] as const;
export const EXEMPTION_INSTITUTIONS=[
 {code:'01',label:'Ministerio de Hacienda'},
 {code:'02',label:'Ministerio de Relaciones Exteriores y Culto'},
 {code:'03',label:'Ministerio de Agricultura y Ganadería'},
 {code:'04',label:'Ministerio de Economía, Industria y Comercio'},
 {code:'05',label:'Cruz Roja Costarricense'},
 {code:'06',label:'Benemérito Cuerpo de Bomberos de Costa Rica'},
 {code:'07',label:'Asociación Obras del Espíritu Santo'},
 {code:'08',label:'Federación Cruzada Nacional de protección al Anciano (Fecrunapa)'},
 {code:'09',label:'Escuela de Agricultura de la Región Húmeda (EARTH)'},
 {code:'10',label:'Instituto Centroamericano de Administración de Empresas (INCAE)'},
 {code:'11',label:'Junta de Protección Social (JPS)'},
 {code:'12',label:'Autoridad Reguladora de los Servicios Públicos (Aresep)'},
 {code:'99',label:'Otros'},
] as const;
const legalNumber=z.string().trim().regex(/^(?:\d{1,6})?$/,'Use hasta seis dígitos o deje el campo vacío.');
const realDay=z.string().regex(/^\d{4}-\d{2}-\d{2}$/,'Indique una fecha completa.').refine(value=>{const at=Date.parse(value+'T12:00:00Z');return Number(value.slice(0,4))>=1&&Number.isFinite(at)&&new Date(at).toISOString().slice(0,10)===value;},'Indique una fecha válida.');
const exemptionSchema=z.object({
 documentType:z.enum(['','02','03','04','08','09','10','99']).refine(value=>value.length>0,'Seleccione un tipo de documento.'),documentOther:z.string().trim().max(100),
 documentNumber:z.string().trim().min(3,'Indique el número de documento (3 a 40 caracteres).').max(40,'El número de documento admite hasta 40 caracteres.'),article:legalNumber,paragraph:legalNumber,
 institution:z.enum(['01','02','03','04','05','06','07','08','09','10','11','12','99']),institutionOther:z.string().trim().max(160),
 issuedOn:realDay,rate:z.string().trim().regex(/^\d{1,2}(?:[.,]\d{1,2})?$/,'Use hasta dos decimales.').transform(value=>value.replace(',','.')).refine(value=>Number(value)>0&&Number(value)<=13,'La tarifa exonerada debe ser mayor que cero y hasta 13.'),
}).strict().superRefine((exemption,ctx)=>{
 if(exemption.documentType==='99'?exemption.documentOther.length<5:exemption.documentOther!=='')ctx.addIssue({code:'custom',path:['documentOther'],message:'Describa Otros con entre 5 y 100 caracteres; en los demás tipos deje este campo vacío.'});
 if(exemption.institution==='99'?exemption.institutionOther.length<5:exemption.institutionOther!=='')ctx.addIssue({code:'custom',path:['institutionOther'],message:'Describa Otra institución con entre 5 y 160 caracteres; en las demás deje este campo vacío.'});
 if(exemption.article&&Number(exemption.article)===0)ctx.addIssue({code:'custom',path:['article'],message:'El artículo debe ser mayor que cero.'});
 if(['02','03','08'].includes(exemption.documentType)&&!exemption.article)ctx.addIssue({code:'custom',path:['article'],message:'Indique el artículo de la ley.'});
 if(exemption.paragraph&&!exemption.article)ctx.addIssue({code:'custom',path:['article'],message:'Indique el artículo al especificar un inciso.'});
});
export const taxSchema=z.object({vatCode:z.enum(['01','02','03','04','08','09','10','11']),exemption:exemptionSchema.nullable()}).strict();
export type InvoiceTax=z.infer<typeof taxSchema>;
export type InvoiceExemption=NonNullable<InvoiceTax['exemption']>;
/** Incomplete form state: no document type, authorization, date or rate is silently inferred. */
export const blankExemption=():InvoiceExemption=>({documentType:'',documentOther:'',documentNumber:'',article:'',paragraph:'',institution:'01',institutionOther:'',issuedOn:'',rate:''});
