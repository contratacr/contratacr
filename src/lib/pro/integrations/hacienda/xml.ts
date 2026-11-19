import {DOCUMENT_ROOTS} from './codes';
import type {EinvoiceModel,ModelLine,ModelParty,ModelTax} from './document';

/**
 * Round 6A: v4.4 XML in the element ORDER of «Anexos y Estructuras v4.4» (pp. 18–60). The output is
 * already in canonical form (no XML declaration in the signed content, no self-closing tags, attributes
 * none on children, escaped text), so the enveloped signature digest equals SHA-256 of this exact text.
 */
export function xmlText(value:string){return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\r/g,'&#xD;');}
const el=(name:string,value:string|number|undefined|null)=>value===undefined||value===null||value===''?'':`<${name}>${xmlText(String(value))}</${name}>`;
const group=(name:string,inner:string)=>inner?`<${name}>${inner}</${name}>`:'';
function emisorXml(model:EinvoiceModel){
 const e=model.emisor;
 return group('Emisor',el('Nombre',e.name)+group('Identificacion',el('Tipo',e.idType)+el('Numero',e.idNumber))+el('NombreComercial',e.commercialName)
  +group('Ubicacion',el('Provincia',e.province)+el('Canton',e.canton)+el('Distrito',e.district)+el('Barrio',e.barrio)+el('OtrasSenas',e.otherSigns))
  +(e.phone?group('Telefono',el('CodigoPais','506')+el('NumTelefono',e.phone)):'')+el('CorreoElectronico',e.email));
}
function receptorXml(receptor:ModelParty|null){
 if(!receptor)return '';
 return group('Receptor',el('Nombre',receptor.name)+(receptor.idType&&receptor.idNumber?group('Identificacion',el('Tipo',receptor.idType)+el('Numero',receptor.idNumber)):'')
  +el('NombreComercial',receptor.commercialName)+(receptor.phone?group('Telefono',el('CodigoPais','506')+el('NumTelefono',receptor.phone)):'')+el('CorreoElectronico',receptor.email));
}
function taxXml(tax:ModelTax){
 const specific=tax.specific&&Object.values(tax.specific).some(Boolean)?group('DatosImpuestoEspecifico',el('CantidadUnidadMedida',tax.specific.quantity)+el('Porcentaje',tax.specific.percent)+el('Proporcion',tax.specific.proportion)+el('VolumenUnidadConsumo',tax.specific.volume)+el('ImpuestoUnidad',tax.specific.unitTax)):'';
 const ex=tax.exemption;
 const exemption=ex?group('Exoneracion',el('TipoDocumentoEX1',ex.type)+el('TipoDocumentoOTRO',ex.type==='99'?ex.typeOther:'')+el('NumeroDocumento',ex.number)+el('Articulo',ex.article)+el('Inciso',ex.clause)
  +el('NombreInstitucion',ex.institution)+el('NombreInstitucionOtros',ex.institution==='99'?ex.institutionOther:'')+el('FechaEmisionEX',ex.issuedOn+'T00:00:00-06:00')+el('TarifaExonerada',ex.rate)+el('MontoExoneracion',ex.amount)):'';
 return group('Impuesto',el('Codigo',tax.code)+(tax.code==='01'?el('CodigoTarifaIVA',tax.vatCode):'')+el('Tarifa',tax.rate)+specific+el('Monto',tax.amount)+exemption);
}
function lineXml(line:ModelLine){
 return group('LineaDetalle',el('NumeroLinea',line.number)+el('CodigoCABYS',line.cabys)+(line.sku?group('CodigoComercial',el('Tipo','01')+el('Codigo',line.sku.slice(0,20))):'')
  +el('Cantidad',line.quantity)+el('UnidadMedida',line.unit)+el('Detalle',line.detail)+el('PrecioUnitario',line.unitPrice)+el('MontoTotal',line.total)
  +(line.discount?group('Descuento',el('MontoDescuento',line.discount.amount)+el('CodigoDescuento',line.discount.code)+el('NaturalezaDescuento',line.discount.nature)):'')
  +el('SubTotal',line.subtotal)+el('BaseImponible',line.base)+line.taxes.map(taxXml).join('')+el('ImpuestoAsumidoEmisorFabrica',line.assumed)+el('ImpuestoNeto',line.netTax)+el('MontoTotalLinea',line.lineTotal));
}
export type XmlHeader={clave:string;consecutivo:string;issuedAt:string};
/** Unsigned document. The signer appends <ds:Signature> right before the closing root tag. */
export function buildEinvoiceXml(model:EinvoiceModel,header:XmlHeader){
 const root=DOCUMENT_ROOTS[model.docType],s=model.summary;
 const charges=model.charges.map(charge=>group('OtrosCargos',el('TipoDocumentoOC',charge.code)+el('TipoDocumentoOTROS',charge.code==='99'?charge.otherDetail:'')
  +(charge.thirdParty?group('IdentificacionTercero',el('Tipo',charge.thirdParty.idType)+el('Numero',charge.thirdParty.id))+el('NombreTercero',charge.thirdParty.name):'')
  +el('Detalle',charge.detail)+el('PorcentajeOC',charge.percent)+el('MontoCargo',charge.amount))).join('');
 const summary=group('ResumenFactura',group('CodigoTipoMoneda',el('CodigoMoneda',s.currency)+el('TipoCambio',s.exchangeRate))
  +el('TotalServGravados',s.servTaxed)+el('TotalServExentos',s.servExempt)+el('TotalServExonerado',s.servExonerated)+el('TotalServNoSujeto',s.servNotSubject)
  +el('TotalMercanciasGravadas',s.mercTaxed)+el('TotalMercanciasExentas',s.mercExempt)+el('TotalMercExonerada',s.mercExonerated)+el('TotalMercNoSujeta',s.mercNotSubject)
  +el('TotalGravado',s.taxed)+el('TotalExento',s.exempt)+el('TotalExonerado',s.exonerated)+el('TotalNoSujeto',s.notSubject)
  +el('TotalVenta',s.sale)+el('TotalDescuentos',s.discounts)+el('TotalVentaNeta',s.netSale)
  +s.breakdown.map(row=>group('TotalDesgloseImpuesto',el('Codigo',row.code)+(row.code==='01'?el('CodigoTarifaIVA',row.vatCode):'')+el('TotalMontoImpuesto',row.amount))).join('')
  +el('TotalImpuesto',s.tax)+el('TotalImpAsumEmisorFabrica',s.assumed)+el('TotalIVADevuelto',s.ivaReturned)+el('TotalOtrosCargos',s.otherCharges)
  +s.paymentMethods.map(method=>group('MedioPago',el('TipoMedioPago',method.code)+el('MedioPagoOtros',method.other)+el('TotalMedioPago',method.amount))).join('')
  +el('TotalComprobante',s.total));
 const reference=model.reference?group('InformacionReferencia',el('TipoDocIR',model.reference.docType)+el('Numero',model.reference.number)+el('FechaEmisionIR',model.reference.issuedAt)+el('Codigo',model.reference.code)+el('Razon',model.reference.reason)):'';
 const others=model.notes?group('Otros',el('OtroTexto',model.notes)):'';
 return `<${root.root} xmlns="${root.namespace}">`+el('Clave',header.clave)+el('ProveedorSistemas',model.providerSystems)+el('CodigoActividadEmisor',model.activityCode)+el('CodigoActividadReceptor',model.receiverActivity)
  +el('NumeroConsecutivo',header.consecutivo)+el('FechaEmision',header.issuedAt)+emisorXml(model)+receptorXml(model.receptor)
  +el('CondicionVenta',model.saleCondition)+(model.saleCondition==='02'?el('PlazoCredito',model.creditDays):'')
  +group('DetalleServicio',model.lines.map(lineXml).join(''))+charges+summary+reference+others+`</${root.root}>`;
}
export const XML_DECLARATION='<?xml version="1.0" encoding="utf-8"?>';
/** Minimal well-formedness check (balanced tags, one root) used before signing and in unit checks. */
export function wellFormed(xml:string){
 const stack:string[]=[];const re=/<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>/g;let match:RegExpExecArray|null,roots=0;
 const body=xml.replace(/^<\?xml[^>]*\?>/,'');
 while((match=re.exec(body))){const [,closing,name,,self]=match;if(self)continue;if(closing){if(stack.pop()!==name)return false;}else{if(!stack.length)roots++;stack.push(name!);}}
 return stack.length===0&&roots===1&&!/&(?!amp;|lt;|gt;|quot;|apos;|#x?[0-9A-Fa-f]+;)/.test(body);
}
