import {VAT_OPTIONS} from './invoice-tax';
import {projectVatCodes,type ProjectVatCode} from './project-details';
import {quantityToInput} from './allowances';

/**
 * IVA predeterminado del proyecto (Detalles del proyecto, `default_vat_code`) aplicado a los
 * borradores NUEVOS que nacen de ese proyecto: líneas nuevas de cotización privada con origen
 * en el trabajo, líneas pendientes del detalle de una factura de trabajo y líneas nuevas de
 * órdenes de compra. Nunca cambia líneas que ya tienen impuesto ni documentos guardados.
 * Sin detalles, sin acceso o ante cualquier error se comporta como antes (sin valor).
 */
export type ProjectDefaultVat={code:ProjectVatCode;rate:string};
export function projectDefaultVatFrom(body:unknown):ProjectDefaultVat|null{
 const code=(body as {details?:{defaultVatCode?:unknown}}|null)?.details?.defaultVatCode;
 if(typeof code!=='string'||!(projectVatCodes as readonly string[]).includes(code))return null;
 const option=VAT_OPTIONS.find(row=>row.code===code);return option?{code:option.code as ProjectVatCode,rate:option.rate}:null;
}
export async function fetchProjectDefaultVat(workId:string,init?:{accountId?:string;signal?:AbortSignal}):Promise<ProjectDefaultVat|null>{
 try{
  const headers:Record<string,string>={};if(init?.accountId)headers['X-Pro-Expected-Actor']=init.accountId;
  const response=await fetch('/api/pro/project-details?'+new URLSearchParams({view:'detail',workId}),{cache:'no-store',headers,signal:init?.signal});
  if(!response.ok)return null;return projectDefaultVatFrom(await response.json());
 }catch{return null;}
}
/** Percentage typed in a tax field («13», «0,5» / «0.5»); empty when the rate is 0 (exempt or 0 %). */
export function projectVatInput(vat:ProjectDefaultVat|null,en:boolean){const rate=vat?Number(vat.rate):0;return rate>0?quantityToInput(rate,en,2):'';}
