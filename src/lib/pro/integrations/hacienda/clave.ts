import type {EinvoiceDocType} from './codes';

/**
 * Round 6A: consecutivo (20 digits) and clave numérica (50) — Anexos v4.4, note 3 and 4.1.
 * consecutivo = branch(3) + terminal(5) + type(2) + number(10)
 * clave = 506 + DD MM YY (Costa Rica date) + emisor id left-padded with zeros to 12 + consecutivo(20) + situación(1) + security code(8)
 * SQL (einvoice-local.sql) composes the stored values; these helpers mirror and validate them.
 */
export function buildConsecutivo(branch:string,terminal:string,type:EinvoiceDocType,number:number){
 if(!/^\d{3}$/.test(branch)||!/^\d{5}$/.test(terminal)||!Number.isInteger(number)||number<1||number>9999999999)throw RangeError('consecutivo');
 return branch+terminal+type+String(number).padStart(10,'0');
}
export function crDateParts(at:Date){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Costa_Rica',day:'2-digit',month:'2-digit',year:'2-digit'}).formatToParts(at).map(part=>[part.type,part.value]));
 return parts.day+parts.month+parts.year;
}
export function buildClave(at:Date,emisorId:string,consecutivo:string,securityCode:string,situation:'1'|'2'|'3'='1'){
 if(!/^[A-Za-z0-9]{9,12}$/.test(emisorId)||!/^\d{20}$/.test(consecutivo)||!/^\d{8}$/.test(securityCode))throw RangeError('clave');
 return '506'+crDateParts(at)+emisorId.padStart(12,'0')+consecutivo+situation+securityCode;
}
export type ParsedClave={country:string;day:string;month:string;year:string;emisor:string;consecutivo:string;branch:string;terminal:string;type:string;number:string;situation:string;securityCode:string};
export function parseClave(clave:string):ParsedClave|null{
 const match=/^(506)(\d{2})(\d{2})(\d{2})([A-Za-z0-9]{12})((\d{3})(\d{5})(\d{2})(\d{10}))([123])(\d{8})$/.exec(clave);
 if(!match)return null;
 const [,country,day,month,year,emisor,consecutivo,branch,terminal,type,number,situation,securityCode]=match;
 return {country:country!,day:day!,month:month!,year:year!,emisor:emisor!,consecutivo:consecutivo!,branch:branch!,terminal:terminal!,type:type!,number:number!,situation:situation!,securityCode:securityCode!};
}
/** Hacienda FechaEmision: RFC 3339 with the Costa Rica offset (UTC−06:00, no DST). */
export function crIsoTimestamp(at:Date){
 const shifted=new Date(at.getTime()-6*3600*1000);
 return shifted.toISOString().slice(0,19)+'-06:00';
}
/** Security code: 8 digits derived from a random action id (stable for retries of the same action). */
export async function securityCodeFor(actionId:string,owner:string){
 const {createHash}=await import('node:crypto');
 const digest=createHash('sha256').update(`ccr-einvoice-security:${owner}:${actionId}`).digest();
 return String(digest.readUInt32BE(0)%100000000).padStart(8,'0');
}
