import {test,expect} from 'playwright/test';
import {invoiceAmounts,blankInvoiceLine,type EditableInvoiceLine} from '../../src/lib/pro/invoice-detail';
import type {InvoiceDraft} from '../../src/lib/pro/invoice-drafts';
import {buildClave,buildConsecutivo,crIsoTimestamp,parseClave} from '../../src/lib/pro/integrations/hacienda/clave';
import {buildDebitNote,buildFromDraft,money5,parseMoney5,summarize,type EmisorSettings,type EinvoiceModel} from '../../src/lib/pro/integrations/hacienda/document';
import {buildEinvoiceXml,wellFormed} from '../../src/lib/pro/integrations/hacienda/xml';
import {MockSigner} from '../../src/lib/pro/integrations/hacienda/signer';
import {EINVOICE_ENV,EinvoiceProviderRefused,GtiProvider,HaciendaSandboxProvider,MOCK_EINVOICE_FIXTURES,MockEinvoiceProvider,einvoiceProviderFor,mockRejections,resolveEinvoiceProvider,type DocumentSubmission} from '../../src/lib/pro/einvoice';
import {buildReceiverMessageXml,receiverMessageInputSchema} from '../../src/lib/pro/einvoice/receiver-message';

// Ronda F2-A — unit level (no browser, server or network): clave layout and Costa Rica dates, totals arithmetic and
// 5-decimal rounding of the v4.4 builder, debit note, currency/exchange rate, MensajeReceptor, the deterministic mock
// provider (async flow, rejection reasons, timeouts, duplicates) and provider/mode resolution (real providers refuse).
test.describe.configure({mode:'serial'});
const settings:EmisorSettings={idType:'02',idNumber:'3101123456',name:'Remodelaciones Prueba S.A.',commercialName:'',activityCode:'410001',province:'1',canton:'01',district:'08',barrio:'',otherSigns:'100 m norte del parque',phone:'',email:'facturas@example.test',branch:'001',terminal:'00001',providerSystems:'3101123456'};
const line=(patch:Partial<EditableInvoiceLine>):EditableInvoiceLine=>({...blankInvoiceLine(),kind:'service',description:'Remodelación de baño',cabys:'4329000000100',unit:'Sp',quantity:'1',unitPrice:'500000',taxTreatment:'vat',taxRate:'13',tax:{vatCode:'08',exemption:null},...patch});
function draft(lines:EditableInvoiceLine[],receiverId='112340567'):InvoiceDraft{
 const totals=invoiceAmounts(lines,[]);
 return {id:'11111111-1111-4111-8111-111111111111',clientId:'c1',kind:'direct',sourceId:'x',title:'Factura',notes:'',receiver:{name:'Carla Cliente',identification:receiverId,email:'',phone:'',address:'',identificationType:'individual',activity:'',province:'',canton:'',district:'',neighborhood:''},
  revision:1,totalCents:totals.totalCents,taxCents:totals.taxCents,agreedCents:null,paidCents:null,balanceCents:null,materialCount:0,materialCost:0,basis:'manual',lines:[],materials:[],nextCursor:null,sourceChanged:false,sourceNeedsAmount:false,sourceAvailable:true,currentFingerprint:null,createdAt:'',updatedAt:'',
  preparation:{issuerName:'',issuerIdType:'',issuerId:'',issuerEmail:'',issuerPhone:'',issuerAddress:'',issuerActivity:'',plannedDate:'',saleCondition:'credit',creditDays:30,paymentMethod:'transfer',orderReference:''},
  editedDetail:{sourceTotalCents:0,sourceTaxCents:null,gross:'0',discount:'0',net:'0',tax:'0',total:'0',version:'1',lines},charges:[]};
}
const tag=(xml:string,name:string)=>new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml)?.[1];
const fe=(lines:EditableInvoiceLine[],receiverId?:string)=>{const built=buildFromDraft(draft(lines,receiverId),settings,'01');if(!built.ok)throw Error(JSON.stringify(built.issues));return built;};
function submission(model:EinvoiceModel,at=new Date('2026-11-19T15:00:00Z'),n=1,patch:Partial<DocumentSubmission>={}):DocumentSubmission{
 const consecutivo=buildConsecutivo('001','00001',model.docType,n),clave=buildClave(at,settings.idNumber,consecutivo,'12345678');
 const xml=buildEinvoiceXml(model,{clave,consecutivo,issuedAt:crIsoTimestamp(at)}),signed=new MockSigner().sign(xml,model.docType,at);
 return {kind:'document',docType:model.docType,clave,consecutivo,issuedAt:crIsoTimestamp(at),emisor:{type:'02',number:settings.idNumber,name:settings.name},
  receptor:model.receptor?{type:model.receptor.idType,number:model.receptor.idNumber,name:model.receptor.name}:null,signedXml:signed.signedXml,totalComprobante:model.summary.total,totalImpuesto:model.summary.tax,attempt:1,currentStatus:'firmado',priorProcessingError:false,...patch};
}

test('clave: 50 digits = 506 + CR date (DDMMYY) + emisor padded to 12 + consecutivo 20 + situación + security code',()=>{
 // 2026-11-20T05:30Z is still 19 Nov 23:30 in Costa Rica (UTC−6, no DST).
 const at=new Date('2026-11-20T05:30:00Z'),consecutivo=buildConsecutivo('002','00015','02',9876543210);
 expect(consecutivo).toBe('00200015029876543210');
 const clave=buildClave(at,'112340567',consecutivo,'00000042','2');
 expect(clave).toBe('506'+'191126'+'000112340567'+'00200015029876543210'+'2'+'00000042');expect(clave).toHaveLength(50);
 expect(parseClave(clave)).toMatchObject({day:'19',month:'11',year:'26',emisor:'000112340567',branch:'002',terminal:'00015',type:'02',number:'9876543210',situation:'2',securityCode:'00000042'});
 expect(crIsoTimestamp(at)).toBe('2026-11-19T23:30:00-06:00');
 // Year boundary in Costa Rica.
 expect(buildClave(new Date('2027-01-01T05:59:59Z'),'3101123456',consecutivo,'11111111').slice(3,9)).toBe('311226');
 for(const bad of [()=>buildConsecutivo('01','00001','01',1),()=>buildConsecutivo('001','00001','01',10000000000),()=>buildClave(at,'1-1234-0567',consecutivo,'1'),()=>buildClave(at,'112340567','1'.repeat(19),'12345678')])expect(bad).toThrow();
 expect(parseClave(clave.slice(1))).toBeNull();
});
test('totals arithmetic and 5-decimal rounding (half away from zero) with service/merchandise/exempt/exonerated',()=>{
 const built=fe([line({unitPrice:'333.33333',quantity:'3'}),line({kind:'product',unit:'Unid',cabys:'2392000000100',description:'Grifería',quantity:'2',unitPrice:'0.00005'}),
  line({description:'Visita exenta',taxTreatment:'exempt',taxRate:'0',tax:{vatCode:'10',exemption:null},unitPrice:'15000'}),
  line({description:'Obra exonerada parcial',unitPrice:'100000',tax:{vatCode:'08',exemption:{documentType:'03',documentOther:'',documentNumber:'AL-77-2026',article:'12',paragraph:'',institution:'01',institutionOther:'',issuedOn:'2026-01-15',rate:'4'}}})]);
 const s=built.model.summary;
 // Line 1: 3 × 333.33333 = 999.99999; IVA 13 % = 129.9999987 → 130.00000. Line 2: 0.00010; IVA 0.000013 → 0.00001.
 expect(built.model.lines[0]!.total).toBe('999.99999');expect(built.model.lines[0]!.taxes[0]!.amount).toBe('130.00000');
 expect(built.model.lines[1]!.taxes[0]!.amount).toBe('0.00001');
 // Exonerated 4 of 13 points: 100000 × 4/13 = 30769.23077 exonerated, the rest taxed.
 expect(s.servExonerated).toBe('30769.23077');expect(s.servTaxed).toBe(money5(parseMoney5('999.99999')+parseMoney5('100000.00000')-parseMoney5('30769.23077')));
 expect(s.servExempt).toBe('15000.00000');expect(s.mercTaxed).toBe('0.00010');
 const sum=(...names:(keyof typeof s)[])=>names.reduce((acc,name)=>acc+parseMoney5(String(s[name])),BigInt(0));
 expect(parseMoney5(s.sale)).toBe(sum('servTaxed','servExempt','servExonerated','servNotSubject','mercTaxed','mercExempt','mercExonerated','mercNotSubject'));
 expect(parseMoney5(s.netSale)).toBe(parseMoney5(s.sale)-parseMoney5(s.discounts));
 expect(parseMoney5(s.total)).toBe(parseMoney5(s.netSale)+parseMoney5(s.tax)+parseMoney5(s.otherCharges)-parseMoney5(s.ivaReturned));
 expect(parseMoney5(s.tax)).toBe(built.model.lines.reduce((acc,row)=>acc+parseMoney5(row.netTax),BigInt(0)));
 for(const value of [s.servTaxed,s.mercTaxed,s.exempt,s.exonerated,s.sale,s.discounts,s.netSale,s.tax,s.total])expect(value).toMatch(/^\d{1,13}\.\d{5}$/);
 const xml=buildEinvoiceXml(built.model,{clave:buildClave(new Date(),'3101123456','0'.repeat(20),'12345678'),consecutivo:'0'.repeat(20),issuedAt:'2026-11-19T09:00:00-06:00'});
 expect(tag(xml,'CondicionVenta')).toBe('02');expect(tag(xml,'PlazoCredito')).toBe('30');expect(tag(xml,'TipoMedioPago')).toBe('04');expect(tag(xml,'CodigoActividadEmisor')).toBe('410001');
 expect(tag(xml,'CodigoMoneda')).toBe('CRC');expect(tag(xml,'TipoCambio')).toBe('1.00000');
 for(const name of ['TotalServGravados','TotalMercanciasGravadas','TotalExento','TotalExonerado','TotalVenta','TotalDescuentos','TotalVentaNeta','TotalImpuesto','TotalComprobante'])expect(tag(xml,name),name).toMatch(/^\d{1,13}\.\d{5}$/);
});
test('currency: CRC is 1.00000; USD needs a positive 5-decimal BCCR rate',()=>{
 const model=fe([line({})]).model;
 const usd=summarize(model.lines,[],'04',{code:'USD',exchangeRate:'506.12000'});expect(usd.currency).toBe('USD');expect(usd.exchangeRate).toBe('506.12000');expect(usd.total).toBe(model.summary.total);
 expect(()=>summarize(model.lines,[],'04',{code:'CRC',exchangeRate:'2.00000'})).toThrow();
 expect(()=>summarize(model.lines,[],'04',{code:'USD',exchangeRate:'0.00000'})).toThrow();
 expect(()=>summarize(model.lines,[],'04',{code:'USD',exchangeRate:'506.12'})).toThrow();
});
test('debit note 02: one line with the original CAByS and VAT code, reference code 02, own root',()=>{
 const original=fe([line({}),line({kind:'product',unit:'m²',cabys:'2392000000100',description:'Cerámica',taxRate:'4',tax:{vatCode:'04',exemption:null},unitPrice:'1000'})]).model;
 const ref={clave:buildClave(new Date('2026-11-18T15:00:00Z'),settings.idNumber,buildConsecutivo('001','00001','01',5),'87654321'),issuedAt:'2026-11-18T09:00:00-06:00',docType:'01' as const};
 const nd=buildDebitNote(original,ref,{reason:'Diferencia de precio de cerámica',lineNumber:2,amount:'2500.55555'});
 expect(nd.ok).toBe(true);if(!nd.ok)return;
 const l=nd.model.lines[0]!;
 expect(nd.model.docType).toBe('02');expect(l.cabys).toBe('2392000000100');expect(l.unit).toBe('m²');expect(l.service).toBe(false);
 expect(l.taxes[0]).toMatchObject({code:'01',vatCode:'04',rate:'4.00',amount:'100.02222'});expect(l.lineTotal).toBe('2600.57777');
 expect(nd.model.summary.mercTaxed).toBe('2500.55555');expect(nd.model.summary.total).toBe('2600.57777');expect(nd.totalCents).toBe(260058);
 expect(nd.model.reference).toEqual({docType:'01',number:ref.clave,issuedAt:ref.issuedAt,code:'02',reason:'Diferencia de precio de cerámica'});
 const xml=buildEinvoiceXml(nd.model,{clave:buildClave(new Date(),settings.idNumber,buildConsecutivo('001','00001','02',1),'12121212'),consecutivo:buildConsecutivo('001','00001','02',1),issuedAt:'2026-11-19T09:00:00-06:00'});
 expect(xml.startsWith('<NotaDebitoElectronica xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaDebitoElectronica">')).toBe(true);
 expect(wellFormed(xml)).toBe(true);expect(xml).toContain('<InformacionReferencia><TipoDocIR>01</TipoDocIR><Numero>'+ref.clave+'</Numero>');
 expect(new MockSigner().sign(xml,'02',new Date()).signedXml.endsWith('</ds:Signature></NotaDebitoElectronica>')).toBe(true);
 for(const bad of [{amount:'0'},{amount:'-5'},{amount:'1.123456'},{lineNumber:9},{reason:'no'}])expect(buildDebitNote(original,ref,{reason:'Diferencia de precio',lineNumber:1,amount:'100',...bad}).ok).toBe(false);
});
test('MensajeReceptor: validation, element order, amounts in 5 decimals, receiver consecutivo type',()=>{
 const clave='50619112600310199999900100001010000000123199999999';
 const input={receivedClave:clave,emisorIdType:'02' as const,emisorId:'3101999999',emisorName:'Ferretería Proveedora',receivedIssuedAt:'2026-11-18T10:00:00-06:00',receivedTotalCents:56500,receivedTaxCents:6500,messageCode:'2' as const,detail:'Parte de la compra es gasto personal',taxCondition:'02' as const,creditTaxCents:3250,expenseCents:28250};
 expect(receiverMessageInputSchema.safeParse(input).success).toBe(true);
 for(const bad of [{emisorId:'3101888888'},{messageCode:'3',detail:''},{creditTaxCents:7000},{receivedTaxCents:60000,receivedTotalCents:50000},{receivedClave:clave.slice(1)}])expect(receiverMessageInputSchema.safeParse({...input,...bad}).success,JSON.stringify(bad)).toBe(false);
 const xml=buildReceiverMessageXml({...input,receptorId:'3101123456',activityCode:'410001',consecutivo:'00100001060000000001'});
 expect(wellFormed(xml)).toBe(true);
 const names=[...xml.matchAll(/<([A-Za-z]+)>/g)].map(m=>m[1]);
 expect(names).toEqual(['Clave','NumeroCedulaEmisor','FechaEmisionDoc','Mensaje','DetalleMensaje','MontoTotalImpuesto','CodigoActividad','CondicionImpuesto','MontoTotalImpuestoAcreditar','MontoTotalDeGastoAplicable','TotalFactura','NumeroCedulaReceptor','NumeroConsecutivoReceptor']);
 expect(tag(xml,'MontoTotalImpuesto')).toBe('65.00000');expect(tag(xml,'MontoTotalImpuestoAcreditar')).toBe('32.50000');expect(tag(xml,'TotalFactura')).toBe('565.00000');
 expect(()=>buildReceiverMessageXml({...input,receptorId:'3101123456',activityCode:'410001',consecutivo:'00100001050000000001'})).toThrow();
 expect(new MockSigner().sign(xml,'MensajeReceptor',new Date()).signedXml).toContain('</ds:Signature></MensajeReceptor>');
});
test('mock provider: recibido → procesando → aceptado; duplicate; unsigned; 503 and timeout retries',async()=>{
 const mock=new MockEinvoiceProvider(),ok=submission(fe([line({})]).model);
 expect(await mock.issue(ok)).toMatchObject({outcome:'received',httpStatus:202,transient:false});
 expect((await mock.getStatus({...ok,currentStatus:'recibido'})).state).toBe('procesando');
 const final=await mock.getStatus({...ok,currentStatus:'procesando'});
 expect(final).toMatchObject({state:'aceptado',responseCode:1,reasons:[]});expect(final.responseXml).toContain('<Mensaje>1</Mensaje>');expect(final.responseXml).toContain('SIMULACIÓN LOCAL');
 expect(await mock.issue({...ok,currentStatus:'recibido'})).toMatchObject({outcome:'duplicate',httpStatus:400});
 expect(await mock.issue({...ok,signedXml:ok.signedXml.replace(/<ds:Signature[\s\S]*<\/ds:Signature>/,'')})).toMatchObject({outcome:'error',httpStatus:400,transient:false});
 const transient=submission(fe([line({})],MOCK_EINVOICE_FIXTURES.transient).model);
 expect(await mock.issue(transient)).toMatchObject({outcome:'error',httpStatus:503,transient:true});
 expect(await mock.issue({...transient,attempt:2,currentStatus:'error'})).toMatchObject({outcome:'received'});
 const late=submission(fe([line({})],MOCK_EINVOICE_FIXTURES.timeout).model);
 expect(await mock.issue(late)).toMatchObject({outcome:'error',httpStatus:0,timedOut:true,transient:true});
 expect(await mock.issue({...late,attempt:2,currentStatus:'error'})).toMatchObject({outcome:'duplicate'});
 const flaky=submission(fe([line({})],MOCK_EINVOICE_FIXTURES.processingError).model);
 expect((await mock.getStatus({...flaky,currentStatus:'procesando'})).state).toBe('error');
 expect((await mock.getStatus({...flaky,currentStatus:'error',priorProcessingError:true})).state).toBe('aceptado');
 expect(await mock.cancel(ok)).toMatchObject({outcome:'received'});
});
test('mock provider: realistic rejection reasons (receptor, CAByS, activity, totals, clave)',async()=>{
 const mock=new MockEinvoiceProvider();
 const receptor=await mock.getStatus({...submission(fe([line({})],MOCK_EINVOICE_FIXTURES.reject).model),currentStatus:'procesando'});
 expect(receptor).toMatchObject({state:'rechazado',responseCode:3});expect(receptor.reasons.join(' ')).toContain('padrón');expect(receptor.responseXml).toContain('<Mensaje>3</Mensaje>');
 expect(mockRejections(submission(fe([line({cabys:MOCK_EINVOICE_FIXTURES.rejectCabys})]).model)).join(' ')).toContain('CAByS');
 const activity=fe([line({})]).model;expect(mockRejections(submission({...activity,activityCode:MOCK_EINVOICE_FIXTURES.rejectActivity})).join(' ')).toContain('actividad');
 const good=submission(fe([line({})]).model);expect(mockRejections(good)).toEqual([]);
 expect(mockRejections({...good,signedXml:good.signedXml.replace(/<TotalComprobante>[^<]*</,'<TotalComprobante>1.00000<')}).join(' ')).toContain('totales');
 expect(mockRejections({...good,consecutivo:buildConsecutivo('001','00001','01',2)}).join(' ')).toContain('consecutivo');
 expect(mockRejections({...good,clave:'506'+'010126'+good.clave.slice(9)}).join(' ')).toContain('fecha');
 const receiver={kind:'receiver' as const,receivedClave:'506191126'+MOCK_EINVOICE_FIXTURES.missingSupplier+'00100001010000000123199999999',consecutivoReceptor:'00100001050000000001',issuedAt:'',emisor:{type:'02',number:'999999',name:'X'},receptor:{type:'02',number:'3101123456',name:'Y'},messageCode:'1' as const,signedXml:'<ds:Signature/>',attempt:1,currentStatus:'procesando',priorProcessingError:false};
 expect((await mock.receiverStatus(receiver)).state).toBe('rechazado');
 expect((await mock.receiverStatus({...receiver,receivedClave:'50619112600310199999900100001010000000123199999999'})).state).toBe('aceptado');
 expect((await mock.receiverStatus({...receiver,currentStatus:'recibido'})).state).toBe('procesando');
});
test('provider resolution: mock default; real providers refuse without env; live needs production + explicit flag',async()=>{
 expect(resolveEinvoiceProvider({})).toEqual({id:'mock',mode:'mock',status:'ready',reason:null,missing:[]});
 expect(resolveEinvoiceProvider({PRO_EINVOICE_PROVIDER:'otro'})).toMatchObject({id:'mock',status:'refused',reason:'unknown_provider'});
 const sandbox=resolveEinvoiceProvider({PRO_EINVOICE_PROVIDER:'hacienda-sandbox'});
 expect(sandbox).toMatchObject({id:'hacienda-sandbox',mode:'sandbox',status:'refused',reason:'not_configured'});expect(sandbox.missing).toEqual([...EINVOICE_ENV['hacienda-sandbox'].sandbox]);
 const full=Object.fromEntries(EINVOICE_ENV['hacienda-sandbox'].live.map(name=>[name,'x']));
 expect(resolveEinvoiceProvider({PRO_EINVOICE_PROVIDER:'hacienda-sandbox',PRO_EINVOICE_MODE:'live',NODE_ENV:'development',...full})).toMatchObject({status:'refused',reason:'live_not_allowed'});
 expect(resolveEinvoiceProvider({PRO_EINVOICE_PROVIDER:'hacienda-sandbox',PRO_EINVOICE_MODE:'live',NODE_ENV:'production',...full})).toMatchObject({status:'refused',reason:'live_not_allowed'});
 expect(resolveEinvoiceProvider({PRO_EINVOICE_PROVIDER:'hacienda-sandbox',PRO_EINVOICE_MODE:'live',NODE_ENV:'production',PRO_EINVOICE_LIVE_CONFIRMED:'1',...full})).toMatchObject({mode:'live',status:'ready'});
 // Without env the stubs refuse BEFORE any network code is loaded.
 const input=submission(fe([line({})]).model);
 await expect(new HaciendaSandboxProvider('sandbox',{}).issue(input)).rejects.toBeInstanceOf(EinvoiceProviderRefused);
 await expect(new HaciendaSandboxProvider('live',{PRO_EINVOICE_PROVIDER:'hacienda-sandbox'}).getStatus(input)).rejects.toMatchObject({reason:'live_not_allowed'});
 await expect(new GtiProvider('sandbox',{}).issue(input)).rejects.toMatchObject({provider:'gti',reason:'not_configured'});
 const gtiEnv={PRO_EINVOICE_PROVIDER:'gti',...Object.fromEntries(EINVOICE_ENV.gti.sandbox.map(name=>[name,'x']))};
 await expect(new GtiProvider('sandbox',gtiEnv).receiverMessage({kind:'receiver',receivedClave:'',consecutivoReceptor:'',issuedAt:'',emisor:{type:'',number:'',name:''},receptor:{type:'',number:'',name:''},messageCode:'1',signedXml:'',attempt:1,currentStatus:'firmado',priorProcessingError:false})).rejects.toMatchObject({reason:'not_implemented'});
 expect(einvoiceProviderFor('mock','gti',gtiEnv)).toBeInstanceOf(MockEinvoiceProvider);
 expect(einvoiceProviderFor('sandbox','gti',{})).toBeInstanceOf(GtiProvider);
});
