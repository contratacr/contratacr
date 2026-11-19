/**
 * Round 6A: Hacienda v4.4 code lists used by ContrataCR (Anexos y Estructuras v4.4, notes 2–23).
 * Source: https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf (bitácora al 22/04/2026).
 */
export const EINVOICE_VERSION='4.4';
export type EinvoiceDocType='01'|'02'|'03'|'04';
/** Note 2: root element and namespace of each document. */
export const DOCUMENT_ROOTS:Record<EinvoiceDocType,{root:string;namespace:string;es:string;en:string}>={
 '01':{root:'FacturaElectronica',namespace:'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica',es:'Factura electrónica',en:'Electronic invoice'},
 '02':{root:'NotaDebitoElectronica',namespace:'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaDebitoElectronica',es:'Nota de débito electrónica',en:'Electronic debit note'},
 '03':{root:'NotaCreditoElectronica',namespace:'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaCreditoElectronica',es:'Nota de crédito electrónica',en:'Electronic credit note'},
 '04':{root:'TiqueteElectronico',namespace:'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico',es:'Tiquete electrónico',en:'Electronic ticket'},
};
export const MESSAGE_NAMESPACE='https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeHacienda';
/** Ronda F2-A: MensajeReceptor (aceptación 05, aceptación parcial 06, rechazo 07 of a RECEIVED document). Validar con XSD oficial. */
export const RECEIVER_MESSAGE_NAMESPACE='https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/mensajeReceptor';
export type ReceiverMessageCode='1'|'2'|'3';
export const RECEIVER_MESSAGE_DOC_TYPES:Record<ReceiverMessageCode,'05'|'06'|'07'>={'1':'05','2':'06','3':'07'};
/** Note 4: identification types (05/06 are restricted; not offered for the emisor here). */
export const ID_TYPES={individual:'01',company:'02',dimex:'03',nite:'04',foreign:'05'} as const;
export const ID_TYPE_LABELS:Record<string,{es:string;en:string}>={'01':{es:'Cédula física',en:'Individual ID'},'02':{es:'Cédula jurídica',en:'Company ID'},'03':{es:'DIMEX',en:'DIMEX'},'04':{es:'NITE',en:'NITE'},'05':{es:'Extranjero no domiciliado',en:'Non-resident foreigner'}};
/** Note 4/4.1: number formats per type. */
export function idNumberValid(type:string,number:string){
 return type==='01'?/^[1-9]\d{8}$/.test(number):type==='02'?/^[A-Za-z0-9]{10}$/.test(number):type==='03'?/^[1-9]\d{10,11}$/.test(number):type==='04'?/^\d{10}$/.test(number):type==='05'?/^[A-Za-z0-9]{1,20}$/.test(number):false;
}
/** Note 5 (subset ContrataCR uses). */
export const SALE_CONDITIONS={cash:'01',credit:'02'} as const;
/** Note 6. */
export const PAYMENT_METHODS={cash:'01',card:'02',transfer:'04',sinpe:'06',other:'99'} as const;
export const PAYMENT_METHOD_LABELS:Record<string,{es:string;en:string}>={'01':{es:'Efectivo',en:'Cash'},'02':{es:'Tarjeta',en:'Card'},'04':{es:'Transferencia – depósito bancario',en:'Bank transfer / deposit'},'06':{es:'SINPE Móvil',en:'SINPE Móvil'},'99':{es:'Otros',en:'Other'}};
/** Note 8.1 IVA tariff codes (in the draft model already: invoice-tax.ts). */
export const VAT_RATES:Record<string,string>={'01':'0','02':'1','03':'2','04':'4','08':'13','09':'0.5','10':'0','11':'0'};
/** Note 9 (credit notes ContrataCR issues). */
export const REFERENCE_CODES={cancel:'01',amount:'02'} as const;
export const REFERENCE_CODE_LABELS:Record<string,{es:string;en:string}>={'01':{es:'Anula documento de referencia',en:'Cancels the referenced document'},'02':{es:'Corrige monto',en:'Corrects the amount'}};
/** Note 10: referenced document type. */
export const REFERENCE_DOC_TYPES:Record<'01'|'04',string>={'01':'01','04':'04'};
/** Ronda F2-A: IVA condition of a received document in MensajeReceptor (note 23 v4.4; validar con XSD oficial). */
export const TAX_CONDITION_LABELS:Record<string,{es:string;en:string}>={'01':{es:'Genera crédito de IVA',en:'Generates VAT credit'},'02':{es:'Genera crédito parcial de IVA',en:'Generates partial VAT credit'},'03':{es:'Bienes de capital',en:'Capital goods'},'04':{es:'Gasto corriente sin crédito',en:'Current expense, no credit'},'05':{es:'Proporcionalidad',en:'Proportionality'}};
/** Note 15 units ContrataCR offers (services first). Services: Sp, Spe, St, Os, Al, Alc, Cm, I. */
export const SERVICE_UNITS=['Sp','Spe','St','Os','Al','Alc','Cm','I'];
export const UNITS=['Sp','Spe','St','Os','Al','Alc','Cm','I','Unid','h','D','Min','m','m²','m³','cm','Mm','Km','Kg','G','T','L','mL','Gal','Ln','Oz','Qq','Kw','kWh','Otros'];
/** Note 20: discount code used for line discounts (Descuento comercial) and «Otros». */
export const DISCOUNT_CODE='07',DISCOUNT_OTHER='99';
/** Note 11: message codes. */
export const MESSAGE_CODES={accepted:1,partial:2,rejected:3} as const;
export const STATUS_LABELS:Record<string,{es:string;en:string}>={
 borrador:{es:'Reservado (sin firmar)',en:'Reserved (unsigned)'},firmado:{es:'Firmado',en:'Signed'},enviado:{es:'Enviado a Hacienda',en:'Sent to Hacienda'},
 recibido:{es:'Recibido por Hacienda',en:'Received by Hacienda'},procesando:{es:'En proceso en Hacienda',en:'Processing at Hacienda'},aceptado:{es:'Aceptado',en:'Accepted'},rechazado:{es:'Rechazado',en:'Rejected'},error:{es:'Error de envío (se reintenta)',en:'Sending error (will retry)'},
};
