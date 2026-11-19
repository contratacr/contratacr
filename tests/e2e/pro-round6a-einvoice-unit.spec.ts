import {test,expect} from 'playwright/test';
import {execFileSync} from 'node:child_process';
import {createHash,createVerify,generateKeyPairSync} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {invoiceAmounts,blankInvoiceLine,type EditableInvoiceLine} from '../../src/lib/pro/invoice-detail';
import type {InvoiceDraft} from '../../src/lib/pro/invoice-drafts';
import {buildClave,buildConsecutivo,crIsoTimestamp,parseClave} from '../../src/lib/pro/integrations/hacienda/clave';
import {buildCreditNote,buildFromDraft,parseMoney5,type EmisorSettings} from '../../src/lib/pro/integrations/hacienda/document';
import {buildEinvoiceXml,wellFormed} from '../../src/lib/pro/integrations/hacienda/xml';
import {MockSigner,XadesSigner,envelop,sha256hex} from '../../src/lib/pro/integrations/hacienda/signer';
import {readPkcs12} from '../../src/lib/pro/integrations/hacienda/pkcs12';
import {MockAtv,MOCK_REJECT_ID,MOCK_TRANSIENT_ID} from '../../src/lib/pro/integrations/hacienda/atv';
import {redact,maskCardNumbers} from '../../src/lib/pro/integrations/redact';
import {retryDelaySeconds} from '../../src/lib/pro/integrations/retry';
import {signWebhook,verifyWebhook,MOCK_WEBHOOK_SECRET} from '../../src/lib/pro/integrations/webhook';
import {MockProcessor,MOCK_CARDS} from '../../src/lib/pro/integrations/payments/mock';
import {luhn} from '../../src/lib/pro/integrations/payments/processor';

// Round 6A — unit-level checks (no browser, no server, no network): clave/consecutivo formats, totals,
// v4.4 element order (structural: the official XSD is not downloadable — cdn.comprobanteselectronicos.go.cr
// answers 403 — so the order is checked against «Anexos y Estructuras v4.4»), canonical-form digests,
// XAdES signature with a throw-away key in a LEGACY .p12 made by the local LibreSSL, mock ATV fixtures,
// redaction, webhook signatures and the mock processor fixtures.
test.describe.configure({mode:'serial'});
const settings:EmisorSettings={idType:'02',idNumber:'3101123456',name:'Remodelaciones Prueba S.A.',commercialName:'Remodela',activityCode:'410001',province:'1',canton:'01',district:'08',barrio:'Barrio Escalante',otherSigns:'100 m norte del parque',phone:'22223333',email:'facturas@example.test',branch:'001',terminal:'00001',providerSystems:'3101123456'};
const line=(patch:Partial<EditableInvoiceLine>):EditableInvoiceLine=>({...blankInvoiceLine(),kind:'service',description:'Remodelación de baño',cabys:'4329000000100',unit:'Sp',quantity:'1',unitPrice:'500000',taxTreatment:'vat',taxRate:'13',tax:{vatCode:'08',exemption:null},...patch});
function draft(lines:EditableInvoiceLine[],patch:Partial<InvoiceDraft>={}):InvoiceDraft{
 const totals=invoiceAmounts(lines,[]);
 return {id:'11111111-1111-4111-8111-111111111111',clientId:'c1',kind:'direct',sourceId:'x',title:'Factura prueba',notes:'Gracias',receiver:{name:'Carla Cliente',identification:'112340567',email:'carla@example.test',phone:'8888-1111',address:'San José',identificationType:'individual',activity:'',province:'',canton:'',district:'',neighborhood:''},
  revision:1,totalCents:totals.totalCents,taxCents:totals.taxCents,agreedCents:null,paidCents:null,balanceCents:null,materialCount:0,materialCost:0,basis:'manual',lines:[],materials:[],nextCursor:null,sourceChanged:false,sourceNeedsAmount:false,sourceAvailable:true,currentFingerprint:null,createdAt:'',updatedAt:'',
  preparation:{issuerName:'',issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:'',issuerActivity:'',plannedDate:'',saleCondition:'cash',creditDays:0,paymentMethod:'sinpe',orderReference:''},
  editedDetail:{sourceTotalCents:0,sourceTaxCents:null,gross:'0',discount:'0',net:'0',tax:'0',total:'0',version:'1',lines},charges:[],...patch};
}
const order=(xml:string,parent:string)=>{const inner=new RegExp(`<${parent}(?: [^>]*)?>([\\s\\S]*?)</${parent}>`).exec(xml)?.[1]??'';const names:string[]=[];let depth=0;for(const m of inner.matchAll(/<(\/?)([A-Za-z:]+)[^>]*>/g)){if(m[1]){depth--;}else{if(depth===0)names.push(m[2]!);depth++;}}return names;};
const isSubsequence=(got:string[],spec:string[])=>{let i=0;for(const name of got){while(i<spec.length&&spec[i]!==name)i++;if(i===spec.length)return false;}return true;};
const ROOT_ORDER=['Clave','ProveedorSistemas','CodigoActividadEmisor','CodigoActividadReceptor','NumeroConsecutivo','FechaEmision','Emisor','Receptor','CondicionVenta','CondicionVentaOtros','PlazoCredito','DetalleServicio','OtrosCargos','ResumenFactura','InformacionReferencia','Otros','ds:Signature'];
const LINE_ORDER=['NumeroLinea','PartidaArancelaria','CodigoCABYS','CodigoComercial','Cantidad','UnidadMedida','TipoTransaccion','UnidadMedidaComercial','Detalle','NumeroVINoSerie','RegistroMedicamento','FormaFarmaceutica','DetalleSurtido','PrecioUnitario','MontoTotal','Descuento','SubTotal','IVACobradoFabrica','BaseImponible','Impuesto','ImpuestoAsumidoEmisorFabrica','ImpuestoNeto','MontoTotalLinea'];
const SUMMARY_ORDER=['CodigoTipoMoneda','TotalServGravados','TotalServExentos','TotalServExonerado','TotalServNoSujeto','TotalMercanciasGravadas','TotalMercanciasExentas','TotalMercExonerada','TotalMercNoSujeta','TotalGravado','TotalExento','TotalExonerado','TotalNoSujeto','TotalVenta','TotalDescuentos','TotalVentaNeta','TotalDesgloseImpuesto','TotalImpuesto','TotalImpAsumEmisorFabrica','TotalIVADevuelto','TotalOtrosCargos','MedioPago','TotalComprobante'];
const EMISOR_ORDER=['Nombre','Identificacion','Registrofiscal8707','NombreComercial','Ubicacion','OtrasSenasExtranjero','Telefono','CorreoElectronico'];
const TAX_ORDER=['Codigo','CodigoImpuestoOTRO','CodigoTarifaIVA','Tarifa','FactorCalculoIVA','DatosImpuestoEspecifico','Monto','MontoExportacion','Exoneracion'];
const tag=(xml:string,name:string)=>new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];

test('clave and consecutivo: 50 and 20 digits, Costa Rica date, padding, round trip',()=>{
 const consecutivo=buildConsecutivo('001','00001','01',42);
 expect(consecutivo).toBe('00100001010000000042');expect(consecutivo).toHaveLength(20);
 // 2026-11-14T03:30Z is still 13 Nov in Costa Rica (UTC−6).
 const clave=buildClave(new Date('2026-11-14T03:30:00Z'),'112340567',consecutivo,'12345678');
 expect(clave).toHaveLength(50);expect(clave).toBe('506'+'131126'+'000112340567'+consecutivo+'1'+'12345678');
 expect(parseClave(clave)).toMatchObject({country:'506',day:'13',month:'11',year:'26',emisor:'000112340567',branch:'001',terminal:'00001',type:'01',number:'0000000042',situation:'1',securityCode:'12345678'});
 expect(buildClave(new Date(),'3101123456',consecutivo,'00000001').slice(9,21)).toBe('003101123456');
 expect(()=>buildConsecutivo('001','00001','01',0)).toThrow();expect(()=>buildClave(new Date(),'31-01',consecutivo,'1')).toThrow();
 expect(crIsoTimestamp(new Date('2026-11-14T03:30:00Z'))).toBe('2026-11-13T21:30:00-06:00');
});
test('FE from a draft: totals, gravado/exento/exonerado, discount, element order v4.4',()=>{
 const lines=[line({}),line({description:'Materiales de enchape',kind:'product',unit:'m²',quantity:'12.5',unitPrice:'8500',discountType:'percent',discount:'10',discountReason:'Cliente frecuente',cabys:'2392000000100'}),
  line({description:'Servicio exento',taxTreatment:'exempt',taxRate:'0',tax:{vatCode:'10',exemption:null},unitPrice:'100000'}),
  line({description:'Servicio exonerado',unitPrice:'200000',tax:{vatCode:'08',exemption:{documentType:'03',documentOther:'',documentNumber:'AL-1234-2026',article:'12',paragraph:'',institution:'01',institutionOther:'',issuedOn:'2026-01-15',rate:'13'}}})];
 const d=draft(lines),built=buildFromDraft(d,settings,'01');
 expect(built.ok,JSON.stringify(!built.ok&&built.issues)).toBe(true);if(!built.ok)return;
 const s=built.model.summary;
 expect(s.servTaxed).toBe('500000.00000');expect(s.servExempt).toBe('100000.00000');expect(s.servExonerated).toBe('200000.00000');
 expect(s.mercTaxed).toBe('106250.00000');expect(s.discounts).toBe('10625.00000');
 expect(s.sale).toBe('906250.00000');expect(s.netSale).toBe('895625.00000');
 // IVA: 500000×13% + 95625×13% = 77431.25; exonerated line 26000 − 26000 = 0.
 expect(s.tax).toBe('77431.25000');expect(s.total).toBe('973056.25000');
 expect(built.totalCents).toBe(d.totalCents);expect(built.totalCents).toBe(97305625);
 expect(parseMoney5(s.sale)).toBe(parseMoney5(s.taxed)+parseMoney5(s.exempt)+parseMoney5(s.exonerated)+parseMoney5(s.notSubject));
 expect(s.breakdown.reduce((sum,row)=>sum+parseMoney5(row.amount),BigInt(0))).toBe(parseMoney5(s.tax));
 const clave=buildClave(new Date(),settings.idNumber,buildConsecutivo('001','00001','01',1),'87654321');
 const xml=buildEinvoiceXml(built.model,{clave,consecutivo:clave.slice(21,41),issuedAt:crIsoTimestamp(new Date())});
 expect(wellFormed(xml)).toBe(true);
 expect(xml.startsWith('<FacturaElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">')).toBe(true);
 expect(isSubsequence(order(xml,'FacturaElectronica'),ROOT_ORDER)).toBe(true);
 expect(order(xml,'FacturaElectronica').slice(0,6)).toEqual(['Clave','ProveedorSistemas','CodigoActividadEmisor','NumeroConsecutivo','FechaEmision','Emisor']);
 expect(isSubsequence(order(xml,'LineaDetalle'),LINE_ORDER)).toBe(true);
 expect(isSubsequence(order(xml,'ResumenFactura'),SUMMARY_ORDER)).toBe(true);
 expect(isSubsequence(order(xml,'Emisor'),EMISOR_ORDER)).toBe(true);
 expect(isSubsequence(order(xml,'Impuesto'),TAX_ORDER)).toBe(true);
 expect(tag(xml,'Clave')).toBe(clave);expect(tag(xml,'NumeroConsecutivo')).toMatch(/^\d{20}$/);expect(tag(xml,'CodigoCABYS')).toMatch(/^\d{13}$/);
 expect(tag(xml,'TotalComprobante')).toBe('973056.25000');expect(tag(xml,'TipoMedioPago')).toBe('06');expect(tag(xml,'CondicionVenta')).toBe('01');
 expect(xml).toContain('<CodigoTarifaIVA>10</CodigoTarifaIVA>');expect(xml).toContain('<TarifaExonerada>13.00</TarifaExonerada><MontoExoneracion>26000.00000</MontoExoneracion>');
 expect(xml).toContain('<Cantidad>12.500</Cantidad><UnidadMedida>m²</UnidadMedida>');
 expect(xml).toContain('<Identificacion><Tipo>01</Tipo><Numero>112340567</Numero></Identificacion>');
 // Every decimal amount has exactly 5 decimals (DecimalDineroType 18,5).
 for(const name of ['MontoTotal','SubTotal','BaseImponible','Monto','ImpuestoNeto','MontoTotalLinea','TotalVenta','TotalImpuesto'])for(const m of xml.matchAll(new RegExp(`<${name}>([^<]*)</${name}>`,'g')))expect(m[1]).toMatch(/^\d{1,13}\.\d{5}$/);
});
test('validation before submit: CABYS, tax, receiver id, payment method, issuer',()=>{
 const bad=draft([line({cabys:'',taxTreatment:'pending',taxRate:'0',tax:null})],{receiver:{...draft([]).receiver,identification:'0123',identificationType:'individual'},preparation:{...draft([]).preparation!,paymentMethod:''}});
 const result=buildFromDraft(bad,null,'01');expect(result.ok).toBe(false);
 const fields=result.ok?[]:result.issues.map(row=>row.field);
 expect(fields).toEqual(expect.arrayContaining(['settings','lines.1.cabys','lines.1.tax','receiver.identification','preparation.paymentMethod']));
 // A ticket accepts no identified receiver.
 const ticket=buildFromDraft(draft([line({})],{receiver:{...draft([]).receiver,identification:'',identificationType:''}}),settings,'04');
 expect(ticket.ok).toBe(true);if(ticket.ok){expect(ticket.model.receptor).toBeNull();expect(buildEinvoiceXml(ticket.model,{clave:'5'.repeat(50),consecutivo:'0'.repeat(20),issuedAt:'x'})).not.toContain('<Receptor>');}
});
test('credit note references the original (01 whole / 02 selected lines) with recomputed totals',()=>{
 const built=buildFromDraft(draft([line({}),line({description:'Pintura',unitPrice:'100000'})]),settings,'01');if(!built.ok)throw Error();
 const clave=buildClave(new Date(),settings.idNumber,buildConsecutivo('001','00001','01',7),'11112222');
 const full=buildCreditNote(built.model,{clave,issuedAt:'2026-11-13T10:00:00-06:00',docType:'01'},{code:'01',reason:'Anulación por error en el receptor',lines:[]});
 expect(full.ok).toBe(true);if(!full.ok)return;expect(full.totalCents).toBe(built.totalCents);
 const part=buildCreditNote(built.model,{clave,issuedAt:'2026-11-13T10:00:00-06:00',docType:'01'},{code:'02',reason:'Se elimina la pintura',lines:[2]});
 expect(part.ok).toBe(true);if(!part.ok)return;expect(part.totalCents).toBe(11300000);expect(part.model.lines.map(l=>l.number)).toEqual([1]);
 const xml=buildEinvoiceXml(part.model,{clave:buildClave(new Date(),settings.idNumber,buildConsecutivo('001','00001','03',1),'33334444'),consecutivo:buildConsecutivo('001','00001','03',1),issuedAt:'2026-11-13T11:00:00-06:00'});
 expect(xml.startsWith('<NotaCreditoElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaCreditoElectronica">')).toBe(true);
 expect(xml).toContain(`<InformacionReferencia><TipoDocIR>01</TipoDocIR><Numero>${clave}</Numero><FechaEmisionIR>2026-11-13T10:00:00-06:00</FechaEmisionIR><Codigo>02</Codigo><Razon>Se elimina la pintura</Razon></InformacionReferencia>`);
 expect(buildCreditNote(built.model,{clave,issuedAt:'',docType:'01'},{code:'02',reason:'no',lines:[2]}).ok).toBe(false);
});
test('mock signer: enveloped ds:Signature, digest = SHA-256 of the unsigned canonical XML, never valid',({},info)=>{
 const built=buildFromDraft(draft([line({})]),settings,'01');if(!built.ok)throw Error();
 const xml=buildEinvoiceXml(built.model,{clave:'5'.repeat(50),consecutivo:'0'.repeat(20),issuedAt:'2026-11-13T10:00:00-06:00'});
 const signed=new MockSigner().sign(xml,'01',new Date('2026-11-13T16:00:00Z'));
 expect(signed.signer).toBe('mock');expect(signed.xmlSha256).toBe(sha256hex(xml));
 expect(signed.signedXml.startsWith('<?xml version="1.0" encoding="utf-8"?><FacturaElectronica')).toBe(true);
 expect(signed.signedXml.endsWith('</ds:Signature></FacturaElectronica>')).toBe(true);
 expect(signed.documentDigest).toBe(createHash('sha256').update(xml).digest('base64'));
 expect(signed.signedXml).toContain('Resoluci%C3%B3n_General_sobre_disposiciones');
 expect(Buffer.from(/<ds:SignatureValue[^>]*>([^<]+)</.exec(signed.signedXml)![1]!,'base64').toString()).toMatch(/^SIMULACION:/);
 expect(wellFormed(signed.signedXml)).toBe(true);
 // Independent XML parser (libxml2 of macOS): the signed document is well-formed and namespace-valid.
 const file=info.outputPath('signed.xml');mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,signed.signedXml);
 expect(()=>execFileSync('xmllint',['--noout','--nonet',file],{stdio:'pipe'})).not.toThrow();
 expect(execFileSync('xmllint',['--nonet','--xpath','count(/*[local-name()="FacturaElectronica"]/*[local-name()="Signature"])',file]).toString().trim()).toBe('1');
});
test('sandbox signer: legacy .p12 (3DES key + RC2-40 cert) parsed without dependencies, RSA-SHA256 XAdES verifies',({},info)=>{
 const dir=info.outputPath('p12');mkdirSync(dir,{recursive:true});
 const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});writeFileSync(join(dir,'key.pem'),privateKey.export({type:'pkcs8',format:'pem'}));
 execFileSync('openssl',['req','-new','-x509','-key',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','2','-subj','/C=CR/O=Prueba local/CN=Firma de prueba ContrataCR'],{stdio:'ignore'});
 execFileSync('openssl',['pkcs12','-export','-inkey',join(dir,'key.pem'),'-in',join(dir,'cert.pem'),'-out',join(dir,'test.p12'),'-passout','pass:1234'],{stdio:'ignore'});
 const material=readPkcs12(readFileSync(join(dir,'test.p12')),'1234');
 expect(material.certificate.subject).toContain('Firma de prueba ContrataCR');
 expect(()=>readPkcs12(readFileSync(join(dir,'test.p12')),'9999')).toThrow(/PIN/);
 // Modern PBES2 (PBKDF2 + AES-256-CBC) container of the same key opens too.
 execFileSync('openssl',['pkcs12','-export','-inkey',join(dir,'key.pem'),'-in',join(dir,'cert.pem'),'-out',join(dir,'aes.p12'),'-passout','pass:1234','-keypbe','AES-256-CBC','-certpbe','AES-256-CBC'],{stdio:'ignore'});
 expect(readPkcs12(readFileSync(join(dir,'aes.p12')),'1234').certificate.fingerprint256).toBe(material.certificate.fingerprint256);
 const built=buildFromDraft(draft([line({})]),settings,'01');if(!built.ok)throw Error();
 const xml=buildEinvoiceXml(built.model,{clave:'5'.repeat(50),consecutivo:'0'.repeat(20),issuedAt:'2026-11-13T10:00:00-06:00'});
 const signed=new XadesSigner(material.key,material.certificate,material.certificateDer).sign(xml,'01',new Date());
 expect(signed.signer).toBe('p12');
 const info2=/<ds:SignedInfo[\s\S]*?<\/ds:SignedInfo>/.exec(signed.signedXml)![0]!,value=/<ds:SignatureValue[^>]*>([^<]+)</.exec(signed.signedXml)![1]!;
 expect(createVerify('RSA-SHA256').update(info2).verify(material.certificate.publicKey,value,'base64')).toBe(true);
 const props=/<xades:SignedProperties[\s\S]*?<\/xades:SignedProperties>/.exec(signed.signedXml)![0]!;
 expect(info2).toContain(createHash('sha256').update(props).digest('base64'));
 expect(info2).toContain(createHash('sha256').update(xml).digest('base64'));
 expect(props).toContain(createHash('sha256').update(material.certificateDer).digest('base64'));
 // envelop() is the same for both signers: tampering the document changes the digest.
 const other=envelop(xml.replace('Remodelación','Remodelacion'),'01',new Date(),{der:material.certificateDer,issuer:'CN=x',serial:'1'},()=>'x');
 expect(other.documentDigest).not.toBe(signed.documentDigest);
});
test('mock ATV fixtures: accepted, rejected, transient error then accepted',async()=>{
 const atv=new MockAtv(),base={clave:'5'.repeat(50),issuedAt:'',emisor:{type:'02',number:settings.idNumber,name:settings.name},signedXml:'<x><ds:Signature></ds:Signature></x>',totalComprobante:'1.00000',totalImpuesto:'0.00000',attempt:1};
 expect((await atv.submit({...base,receptor:null})).outcome).toBe('sent');
 expect((await atv.status({...base,receptor:null})).state).toBe('aceptado');
 const rejected=await atv.status({...base,receptor:{type:'01',number:MOCK_REJECT_ID,name:'x'}});expect(rejected.state).toBe('rechazado');expect(rejected.responseCode).toBe(3);expect(rejected.responseXml).toContain('<Mensaje>3</Mensaje>');
 const first=await atv.submit({...base,receptor:{type:'01',number:MOCK_TRANSIENT_ID,name:'x'}});expect(first.outcome).toBe('error');
 expect((await atv.submit({...base,attempt:2,receptor:{type:'01',number:MOCK_TRANSIENT_ID,name:'x'}})).outcome).toBe('sent');
 expect((await atv.submit({...base,signedXml:'<x/>',receptor:null})).outcome).toBe('error');
});
test('redaction, retry backoff, webhook signatures, mock processor fixtures',async()=>{
 expect(redact({password:'abc',api_key:'k',nested:{token:'t',card:'4242424242424242',clave:'5'.repeat(50)}})).toEqual({password:'[redactado]',api_key:'[redactado]',nested:{token:'[redactado]',card:'••••4242',clave:'5'.repeat(50)}});
 expect(maskCardNumbers('pago 4000 0000 0000 0002 ok')).toBe('pago 4000 0000 0000 0002 ok');expect(maskCardNumbers('x4000000000000002y')).toBe('x••••0002y');
 expect(redact('<FacturaElectronica>'+'a'.repeat(300))).toMatch(/XML omitido/);
 expect([1,2,3,7,8,20].map(retryDelaySeconds)).toEqual([30,60,120,1920,3600,3600]);
 const body=JSON.stringify({id:'evt_x'}),sig=signWebhook(MOCK_WEBHOOK_SECRET,body);
 expect(verifyWebhook(MOCK_WEBHOOK_SECRET,body,sig)).toEqual({ok:true});
 expect(verifyWebhook(MOCK_WEBHOOK_SECRET,body+' ',sig)).toEqual({ok:false,reason:'mismatch'});
 expect(verifyWebhook('other',body,sig).ok).toBe(false);expect(verifyWebhook(MOCK_WEBHOOK_SECRET,body,null).ok).toBe(false);
 expect(verifyWebhook(MOCK_WEBHOOK_SECRET,body,signWebhook(MOCK_WEBHOOK_SECRET,body,Math.floor(Date.now()/1000)-3600))).toEqual({ok:false,reason:'stale'});
 expect(luhn(MOCK_CARDS.approved)&&luhn(MOCK_CARDS.declined)&&luhn(MOCK_CARDS.threeDs)&&luhn(MOCK_CARDS.insufficient)).toBe(true);
 const p=new MockProcessor(),card={expMonth:12,expYear:2099,cvc:'123',name:'Ana'};
 expect((await p.chargeCard({attemptId:'a',amountCents:100,description:'',card:{...card,number:MOCK_CARDS.approved}})).status).toBe('pending');
 const events=p.drainEvents();expect(events).toHaveLength(1);expect(events[0]!.event.type).toBe('payment.succeeded');expect(verifyWebhook(MOCK_WEBHOOK_SECRET,events[0]!.body,events[0]!.signature).ok).toBe(true);
 expect(events[0]!.body).not.toContain('4242424242424242');
 expect(await p.chargeCard({attemptId:'b',amountCents:100,description:'',card:{...card,number:MOCK_CARDS.declined}})).toMatchObject({status:'failed',failureCode:'card_declined',cardLast4:'0002'});
 expect((await p.chargeCard({attemptId:'c',amountCents:100,description:'',card:{...card,number:MOCK_CARDS.threeDs}})).status).toBe('requires_action');
 expect(p.drainEvents()).toHaveLength(0);
 expect((await p.confirmSinpe({processorRef:'ccr_sinpe_d',amountCents:100,currency:'CRC',reference:'00012345678',code:''})).status).toBe('failed');
 expect(await p.confirmSinpe({processorRef:'ccr_sinpe_e',amountCents:100,currency:'CRC',reference:'2026111312345678',code:''})).toEqual({status:'pending',processorRef:'ccr_sinpe_e'});
 const sinpe=p.drainEvents()[0]!.event;expect(sinpe.id).toMatch(/^evt_[a-f0-9]{24}$/);expect(sinpe).toMatchObject({processorRef:'ccr_sinpe_e',amountCents:100});
});
