import 'server-only';
import {nameSimilarity,normalizeName,NAME_MATCH_THRESHOLD,getIdentityVerifier} from '@/lib/verification/identity-verifier';

// LOCAL PRO ONLY (multivertical M1): Hacienda lookup of a cédula jurídica for «reclamar con cédula jurídica».
// Adapter with two modes:
//  * mock (default; DIR_HACIENDA_MODE unset or 'mock'): never touches the network. Deterministic test registry:
//      3101000001 → «Comercializadora La Prueba Sociedad Anónima»
//      3101000002 → «Inversiones Doña Prueba Limitada»
//      3101000009 → service unavailable
//      any other  → not found
//  * live (DIR_HACIENDA_MODE='live'): the existing public Hacienda adapter (HaciendaIdentityVerifier, cached, rate
//    limited). It is a read-only lookup: nothing is sent to anyone.
// The claimant types the legal name as registered; it must match the official name (same token rule and threshold
// as identity verification). Staff still review the claim (official name vs. place name) before approving.
export type HaciendaClaimLookup={status:'matched';officialName:string;score:number}|{status:'mismatch'|'not_found'|'unavailable'|'not_juridica'};
const MOCK:Record<string,string|null>={'3101000001':'Comercializadora La Prueba Sociedad Anónima','3101000002':'Inversiones Doña Prueba Limitada','3101000009':null};
/** Legal-form words (S.A., Sociedad Anónima, S.R.L., Limitada…) say nothing about WHICH company it is: compared without them. */
export function withoutLegalForm(name:string){
 return ` ${normalizeName(name)} `.replace(/ (SOCIEDAD DE RESPONSABILIDAD LIMITADA|SOCIEDAD ANONIMA|SOCIEDAD CIVIL|S R L|S A|SRL|SA|LTDA|LIMITADA|LTD|INC|CORP) /g,' ').replace(/\s+/g,' ').trim();
}
export const haciendaMode=()=>process.env.DIR_HACIENDA_MODE==='live'?'live':'mock';

export async function lookupJuridica(cedula:string,legalName:string):Promise<HaciendaClaimLookup>{
 if(!/^3\d{9}$/.test(cedula))return {status:'not_juridica'};
 let official:string|null;
 if(haciendaMode()==='mock'){
  if(!(cedula in MOCK))return {status:'not_found'};
  official=MOCK[cedula]??null;if(!official)return {status:'unavailable'};
 }else{
  const r=await getIdentityVerifier().lookup(cedula);
  if(r.unavailable)return {status:'unavailable'};
  if(!r.found||!r.fullName)return {status:'not_found'};
  if(r.idType&&r.idType!=='juridica')return {status:'not_juridica'};
  official=r.fullName;
 }
 const score=Math.round(nameSimilarity(withoutLegalForm(legalName),withoutLegalForm(official))*100)/100;
 return score>=NAME_MATCH_THRESHOLD?{status:'matched',officialName:official,score:Math.min(1,score)}:{status:'mismatch'};
}
