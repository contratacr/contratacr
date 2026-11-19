import {test,expect} from 'playwright/test';
import {createHmac,randomBytes} from 'node:crypto';
import {open,pkceChallenge,pkcePair,seal,stateHash,boxKeyId,VaultError} from '../../src/lib/pro/integrations/oauth/vault';
import {mockExchange,mockIssueCode,MockOAuthError,mockAuthorizeUrl} from '../../src/lib/pro/integrations/oauth/mock';
import {textPdf,winAnsi} from '../../src/lib/pro/integrations/esign/pdf';
import {certificatePdf,originalPdf,signedPdf,pdfSha256,SIGN_ANCHOR,type Snapshot} from '../../src/lib/pro/integrations/esign/document';
import {MOCK_ESIGN_SECRET,mockEvent} from '../../src/lib/pro/integrations/esign/events';
import {connectStatus,verifyConnectHmac} from '../../src/lib/pro/integrations/esign/connect';
import {verifyWebhook} from '../../src/lib/pro/integrations/webhook';
import {accountingCsv} from '../../src/lib/pro/integrations/accounting/csv';
import {invoiceBreakdown,mappingGaps,type Sources} from '../../src/lib/pro/integrations/accounting/model';
import {redact} from '../../src/lib/pro/integrations/redact';
import {integrationProviders,providerConfig,providerRegistry} from '../../src/lib/pro/integrations/registry';
import {connectorMutationSchema} from '../../src/lib/pro/integrations/workspace/api';

// Round 6B — unit-level checks (no browser, no server, no network): token vault, PKCE and the mock
// authorization server, PDF writer and signature documents, signed provider events, DocuSign Connect HMAC,
// CSV export for Costa Rica, accounting breakdown/gaps, registry and the email confirmation contract.
const env={PRO_OAUTH_TOKEN_KEY:randomBytes(32).toString('base64')};
const snapshot:Snapshot={kind:'contract',documentId:'00000000-0000-4000-8000-000000000001',label:'CT-0001 · Contrato de remodelación',title:'Contrato de remodelación',version:1,clientName:'Carla Cliente',clientEmail:'carla@example.test',language:'es',currency:'CRC',totalCents:113000000,
 content:{code:'CT-0001',title:'Contrato de remodelación',company:{name:'Obras Ñandú S.A.',identification:'3101123456'},project:{name:'Baño',address:'San José'},clauses:[{position:1,title:'Objeto',body:'Remodelación completa del baño (incluye azulejo “premium”) — ₡1.130.000.'}]},contentHash:'a'.repeat(64)};
test('Round 6B: token vault seals with AES-256-GCM, never contains the token, detects tampering and key mix-ups',()=>{
 const token='ya29.a0AfH6SMB-real-looking-token';
 const box=seal(token,'env',env);
 expect(box).toMatch(/^v1\.env\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{8,}$/);
 expect(box).not.toContain(token);expect(box).not.toContain('ya29');expect(boxKeyId(box)).toBe('env');
 expect(open(box,env)).toBe(token);
 expect(seal(token,'env',env)).not.toBe(box); // random IV
 const parts=box.split('.');parts[4]=parts[4]!.slice(0,-2)+(parts[4]!.endsWith('A')?'BB':'AA');
 expect(()=>open(parts.join('.'),env)).toThrow(VaultError);
 expect(()=>open(box,{PRO_OAUTH_TOKEN_KEY:randomBytes(32).toString('base64')})).toThrow(VaultError);
 expect(()=>open(box.replace('v1.env.','v1.mock.'),env)).toThrow(VaultError); // the public mock key cannot open a real box
 expect(()=>seal(token,'env',{})).toThrow(/PRO_OAUTH_TOKEN_KEY/);
 expect(()=>seal(token,'env',{PRO_OAUTH_TOKEN_KEY:'corta'})).toThrow(/32 bytes/);
 expect(open(seal('mock-at-x','mock'),{})).toBe('mock-at-x');
});
test('Round 6B: PKCE S256, single-purpose state hash and the mock authorization server',()=>{
 const {verifier,challenge}=pkcePair();
 expect(verifier.length).toBeGreaterThanOrEqual(43);expect(challenge).toBe(pkceChallenge(verifier));expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
 expect(stateHash('abc')).toMatch(/^[a-f0-9]{64}$/);expect(stateHash('abc')).not.toBe(stateHash('abd'));
 const url=new URL(mockAuthorizeUrl('http://127.0.0.1:3185',{provider:'google',state:'s'.repeat(43),challenge,locale:'es'}));
 expect(url.pathname).toBe('/api/pro/oauth/mock-authorize');expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:3185/api/pro/oauth/callback');
 const code=mockIssueCode('google',challenge);
 const tokens=mockExchange('google',code,verifier);
 expect(tokens.accessToken).toMatch(/^mock-at-/);expect(tokens.accountEmail).toContain('.mock');expect(tokens.realmId).toBeNull();
 expect(()=>mockExchange('google',code,pkcePair().verifier)).toThrow(MockOAuthError); // wrong verifier
 expect(()=>mockExchange('microsoft',code,verifier)).toThrow(MockOAuthError); // other provider
 expect(()=>mockExchange('google',code.slice(0,-3)+'xyz',verifier)).toThrow(MockOAuthError); // forged MAC
 expect(()=>mockExchange('google',mockIssueCode('google',challenge,Date.now()-10*60000),verifier)).toThrow(MockOAuthError); // expired
 expect(mockExchange('quickbooks',mockIssueCode('quickbooks',challenge),verifier).realmId).toMatch(/^\d+$/);
});
test('Round 6B: PDF writer and signature documents are valid, deterministic and carry the evidence',()=>{
 expect(winAnsi('₡ “a” — ñ 🙂')).toBe('CRC  "a" - ñ ?');
 const pdf=textPdf([{text:'Hola (mundo) \\ prueba',bold:true},{text:'x '.repeat(3000)}],'pie');
 const text=pdf.toString('latin1');
 expect(text.startsWith('%PDF-1.4')).toBe(true);expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
 const xref=Number(/startxref\n(\d+)/.exec(text)![1]);expect(text.slice(xref,xref+4)).toBe('xref');
 for(const [,offset,num] of text.slice(xref).matchAll(/(\d{10}) 00000 n /g).map((m,i)=>[m,Number(m[1]),i+1] as const))expect(text.slice(offset,offset+String(num).length+6)).toBe(`${num} 0 obj`);
 expect(/\/Count (\d+)/.exec(text)![1]).not.toBe('1'); // wrapped onto several pages
 expect(text).toContain('Hola \\(mundo\\) \\\\ prueba');
 const original=originalPdf(snapshot,'mock');
 expect(pdfSha256(originalPdf(snapshot,'mock'))).toBe(pdfSha256(original)); // byte-identical re-render
 expect(original.toString('latin1')).toContain(SIGN_ANCHOR);expect(original.toString('latin1')).toContain('SIMULACI');
 const signed=signedPdf(snapshot,{envelopeId:'env_'+'1'.repeat(24),typedName:'Carla Cliente',signedAt:'2026-11-13T15:00:00Z',mode:'mock'});
 expect(signed.toString('latin1')).toContain('Firmado electr');expect(signed.toString('latin1')).toContain(pdfSha256(original));
 const certificate=certificatePdf(snapshot,{envelopeId:'env_'+'1'.repeat(24),mode:'mock',provider:'Simulación local',signerName:'Carla Cliente',signerEmail:'carla@example.test',events:[{status:'created',source:'owner',at:'2026-11-13T14:00:00Z'},{status:'sent',source:'owner',at:'2026-11-13T14:00:01Z'},{status:'viewed',source:'provider',at:'2026-11-13T14:30:00Z'},{status:'signed',source:'provider',at:'2026-11-13T15:00:00Z'}],signedSha256:pdfSha256(signed),originalSha256:pdfSha256(original)});
 const cert=certificate.toString('latin1');
 for(const value of [pdfSha256(signed),pdfSha256(original),'a'.repeat(64),'Ley 8454','Abierta por quien firma','hora de Costa Rica'])expect(cert).toContain(value);
 expect(cert).toContain('8:00:00'); // 14:00 UTC = 08:00 America/Costa_Rica
});
test('Round 6B: signed provider events verify; DocuSign Connect HMAC and status mapping',()=>{
 const event=mockEvent('env_'+'2'.repeat(24),'completed',{typedName:'Carla'});
 expect(event.event.id).toMatch(/^evt_[a-p]{24}$/);expect(mockEvent('env_'+'2'.repeat(24),'completed').event.id).toBe(event.event.id); // same event id → idempotent inbox
 expect(verifyWebhook(MOCK_ESIGN_SECRET,event.body,event.signature).ok).toBe(true);
 expect(verifyWebhook(MOCK_ESIGN_SECRET,event.body.replace('Carla','Otra'),event.signature)).toEqual({ok:false,reason:'mismatch'});
 const body='{"event":"envelope-completed"}',key='connect-key',header=createHmac('sha256',key).update(body).digest('base64');
 expect(verifyConnectHmac(key,body,header)).toBe(true);expect(verifyConnectHmac(key,body+' ',header)).toBe(false);expect(verifyConnectHmac(key,body,null)).toBe(false);expect(verifyConnectHmac('',body,header)).toBe(false);
 expect(connectStatus('envelope-delivered')).toBe('delivered');expect(connectStatus('envelope-voided','Envelope has expired.')).toBe('expired');expect(connectStatus('envelope-voided','Cliente pidió cambios')).toBe('voided');expect(connectStatus('recipient-sent')).toBeNull();
});
const sources:Sources={scope:'all',customers:[{localId:'c1',name:'=HYPERLINK("x")',tradeName:null,email:'a@b.cc',phone:'8888',identification:'112340567',address:'San José; centro',hash:'h'}],
 invoices:[{localId:'i1',number:'00100001010000000001',emitted:true,clave:'5061311260031011234560010000101000000000117',clientId:'c1',customer:'Carla',customerId:'112340567',title:'Baño',date:'2026-11-13',totalCents:121000000,taxCents:12500000,currency:'CRC',hash:'h',
  lines:[{line:1,description:'Mano de obra',quantity:'1',unitPrice:'500000',discountType:'amount',discount:'0',taxTreatment:'vat',taxRate:'13',vatCode:'08'},{line:2,description:'Material',quantity:'2',unitPrice:'250000',discountType:'percent',discount:'10',taxTreatment:'vat',taxRate:'4',vatCode:'04'},{line:2,description:'Exento',quantity:'1',unitPrice:'260000',discountType:'amount',discount:'0',taxTreatment:'exempt',taxRate:'0',vatCode:'10'}]},
  {localId:'i2',number:'BORRADOR-ABCDEF12',emitted:false,clave:null,clientId:'c1',customer:'Carla',customerId:'112340567',title:'Sin detalle',date:'2026-12-01',totalCents:11300000,taxCents:1300000,currency:'CRC',hash:'h',lines:[]}],
 payments:[{localId:'p1',invoiceId:'i1',clientId:'c1',amountCents:50000000,date:'2026-11-14',method:'sinpe',reference:'+123',hash:'h'}]};
test('Round 6B: accounting breakdown, mapping gaps and the CSV export for Costa Rica',()=>{
 const {byCode,rows}=invoiceBreakdown(sources.invoices[0]!);
 expect(rows.map(r=>r.netCents)).toEqual([50000000,45000000,26000000]);
 expect(byCode.get('08')).toEqual({netCents:50000000,taxCents:6500000});expect(byCode.get('04')).toEqual({netCents:45000000,taxCents:1800000});
 expect(invoiceBreakdown(sources.invoices[1]!).rows).toEqual([{description:'Sin detalle',vatCode:'08',netCents:10000000,taxCents:1300000}]);
 expect(mappingGaps({incomeAccount:'',depositAccount:'',vatMap:{'08':'5'}},sources)).toEqual(['income','deposit','vat:04','vat:10']);
 expect(mappingGaps({incomeAccount:'1',depositAccount:'35',vatMap:{'08':'5','04':'6','10':'10'}},sources)).toEqual([]);
 const cr=accountingCsv(sources,'invoices','cr');
 expect(cr.startsWith('﻿Fecha;Número;Clave Hacienda;Estado')).toBe(true);
 const first=cr.split('\r\n')[1]!.split(';');
 expect(first.slice(0,4)).toEqual(['2026-11-13','00100001010000000001','5061311260031011234560010000101000000000117','Emitida']);
 expect(first).toContain('500000,00');expect(first).toContain('65000,00');expect(first).toContain('18000,00');expect(first).toContain('260000,00');expect(first).toContain('1210000,00');
 expect(accountingCsv(sources,'invoices','cr',{from:'2026-11-20'}).split('\r\n').filter(Boolean)).toHaveLength(2);
 const std=accountingCsv(sources,'invoices','standard',{},true);expect(std.startsWith('Date,Number')).toBe(true);expect(std).toContain('1210000.00');expect(std).toContain('Internal draft');
 const customers=accountingCsv(sources,'customers','cr');
 expect(customers).toContain(`"'=HYPERLINK(""x"")"`); // formula injection neutralized and quoted
 expect(customers).toContain('"San José; centro"');
 expect(accountingCsv(sources,'payments','cr')).toContain("'+123");
});
test('Round 6B: registry, redaction and the explicit email confirmation contract',()=>{
 expect(integrationProviders.slice(0,8)).toEqual(['hacienda','tilopay','esign','google','microsoft','quickbooks','ai','transcription']);// 6C added ai + transcription; 6D appended five marketing providers
 for(const id of ['esign','google','microsoft','quickbooks'] as const){const d=providerRegistry[id];expect(d.env.sandbox.length).toBeGreaterThan(0);expect(d.docs.every(u=>u.startsWith('https://'))).toBe(true);expect(d.env.sandbox.every(n=>/^PRO_[A-Z0-9_]+$/.test(n))).toBe(true);}
 expect(providerRegistry.google.env.sandbox).toContain('PRO_OAUTH_TOKEN_KEY');
 expect(providerConfig('esign',{expiryDays:20,apiKey:'x'})).toEqual({expiryDays:20,reminderDays:3});
 expect(redact({access_token:'ya29.x',refresh_token:'1//x',code_verifier:'v',envelopeId:'env_1'})).toEqual({access_token:'[redactado]',refresh_token:'[redactado]',code_verifier:'v',envelopeId:'env_1'});
 const base={action:'send_email',actionId:crypto.randomUUID(),provider:'google',to:['a@b.cc'],subject:'S',body:'B',workId:null,attachments:[]};
 expect(connectorMutationSchema.safeParse({...base,confirmed:true}).success).toBe(true);
 expect(connectorMutationSchema.safeParse({...base,confirmed:false}).success).toBe(false);
 expect(connectorMutationSchema.safeParse(base).success).toBe(false);
 expect(connectorMutationSchema.safeParse({...base,confirmed:true,to:Array.from({length:11},(_,i)=>`a${i}@b.cc`)}).success).toBe(false);
});
