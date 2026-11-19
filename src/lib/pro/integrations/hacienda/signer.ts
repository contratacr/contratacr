import {createHash,createSign,randomUUID,type KeyObject,type X509Certificate} from 'node:crypto';
import {DOCUMENT_ROOTS,type EinvoiceDocType} from './codes';
import {XML_DECLARATION} from './xml';

/**
 * Round 6A: XAdES-EPES signing interface (Anexo 2 v4.4): ENVELOPED ds:Signature as last child of the root,
 * RSA-SHA256, SHA-256 digests, exclusive C14N, policy = Hacienda's resolution PDF.
 * - MockSigner (mock mode): same structure and REAL digests, but SignatureValue/certificate are marked as a
 *   local simulation — Hacienda would reject it, by design.
 * - XadesSigner (sandbox/production): RSA key + certificate from the .p12 named by env vars (pkcs12.ts).
 * Every element below is written already in exclusive-canonical form, so the digests are computed over
 * exactly the bytes that a C14N verifier reproduces.
 */
export const DS='http://www.w3.org/2000/09/xmldsig#',XADES='http://uri.etsi.org/01903/v1.3.2#';
const EXC_C14N='http://www.w3.org/2001/10/xml-exc-c14n#',RSA_SHA256='http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',SHA256='http://www.w3.org/2001/04/xmlenc#sha256',XPATH='http://www.w3.org/TR/1999/REC-xpath-19991116';
export const POLICY_URL='https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf';
/** SHA-256 of the policy PDF as published in Hacienda's v4.4 signature example (Anexo 2, p. 88). */
export const POLICY_DIGEST='DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=';
export type SignedDocument={signedXml:string;xmlSha256:string;signedSha256:string;signer:'mock'|'p12';documentDigest:string};
export interface EinvoiceSigner{readonly kind:'mock'|'p12';sign(xml:string,docType:EinvoiceDocType,at:Date):Promise<SignedDocument>|SignedDocument;}
const b64=(data:Buffer|string)=>createHash('sha256').update(data).digest('base64');
export const sha256hex=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');
type Cert={der:Buffer;issuer:string;serial:string};
function signedProperties(id:string,at:Date,cert:Cert){
 const ds=` xmlns:ds="${DS}"`;
 return `<xades:SignedProperties xmlns:xades="${XADES}" Id="xades-${id}"><xades:SignedSignatureProperties><xades:SigningTime>${at.toISOString().slice(0,19)}Z</xades:SigningTime>`
  +`<xades:SigningCertificate><xades:Cert><xades:CertDigest><ds:DigestMethod${ds} Algorithm="${SHA256}"></ds:DigestMethod><ds:DigestValue${ds}>${b64(cert.der)}</ds:DigestValue></xades:CertDigest>`
  +`<xades:IssuerSerial><ds:X509IssuerName${ds}>${cert.issuer.replace(/&/g,'&amp;').replace(/</g,'&lt;')}</ds:X509IssuerName><ds:X509SerialNumber${ds}>${cert.serial}</ds:X509SerialNumber></xades:IssuerSerial></xades:Cert></xades:SigningCertificate>`
  +`<xades:SignaturePolicyIdentifier><xades:SignaturePolicyId><xades:SigPolicyId><xades:Identifier>${POLICY_URL}</xades:Identifier></xades:SigPolicyId>`
  +`<xades:SigPolicyHash><ds:DigestMethod${ds} Algorithm="${SHA256}"></ds:DigestMethod><ds:DigestValue${ds}>${POLICY_DIGEST}</ds:DigestValue></xades:SigPolicyHash></xades:SignaturePolicyId></xades:SignaturePolicyIdentifier></xades:SignedSignatureProperties>`
  +`<xades:SignedDataObjectProperties><xades:DataObjectFormat ObjectReference="#r-${id}"><xades:MimeType>text/xml</xades:MimeType><xades:Encoding>UTF-8</xades:Encoding></xades:DataObjectFormat></xades:SignedDataObjectProperties></xades:SignedProperties>`;
}
function signedInfo(id:string,documentDigest:string,propertiesDigest:string){
 return `<ds:SignedInfo xmlns:ds="${DS}"><ds:CanonicalizationMethod Algorithm="${EXC_C14N}"></ds:CanonicalizationMethod><ds:SignatureMethod Algorithm="${RSA_SHA256}"></ds:SignatureMethod>`
  +`<ds:Reference Id="r-${id}" URI=""><ds:Transforms><ds:Transform Algorithm="${XPATH}"><ds:XPath>not(ancestor-or-self::ds:Signature)</ds:XPath></ds:Transform><ds:Transform Algorithm="${EXC_C14N}"></ds:Transform></ds:Transforms>`
  +`<ds:DigestMethod Algorithm="${SHA256}"></ds:DigestMethod><ds:DigestValue>${documentDigest}</ds:DigestValue></ds:Reference>`
  +`<ds:Reference Type="http://uri.etsi.org/01903#SignedProperties" URI="#xades-${id}"><ds:Transforms><ds:Transform Algorithm="${EXC_C14N}"></ds:Transform></ds:Transforms><ds:DigestMethod Algorithm="${SHA256}"></ds:DigestMethod><ds:DigestValue>${propertiesDigest}</ds:DigestValue></ds:Reference></ds:SignedInfo>`;
}
/** Builds the enveloped signature; `signInfo` returns base64 SignatureValue over the canonical SignedInfo. */
export function envelop(xml:string,docType:EinvoiceDocType,at:Date,cert:Cert,signInfo:(canonical:string)=>string,id=randomUUID().replace(/-/g,'')):SignedDocument&{signedInfo:string;signedProperties:string}{
 const root=DOCUMENT_ROOTS[docType].root,closing=`</${root}>`;
 if(!xml.endsWith(closing))throw Error('unexpected root');
 const documentDigest=b64(Buffer.from(xml,'utf8'));
 const props=signedProperties(id,at,cert),info=signedInfo(id,documentDigest,b64(Buffer.from(props,'utf8')));
 const value=signInfo(info);
 // In the document the ds prefix is declared on ds:Signature; SignedInfo/SignedProperties keep their (redundant, canonical) declarations.
 const signature=`<ds:Signature xmlns:ds="${DS}" Id="id-${id}">${info}<ds:SignatureValue Id="value-${id}">${value}</ds:SignatureValue>`
  +`<ds:KeyInfo><ds:X509Data><ds:X509Certificate>${cert.der.toString('base64')}</ds:X509Certificate></ds:X509Data></ds:KeyInfo>`
  +`<ds:Object><xades:QualifyingProperties xmlns:xades="${XADES}" Target="#id-${id}">${props}</xades:QualifyingProperties></ds:Object></ds:Signature>`;
 const signedXml=XML_DECLARATION+xml.slice(0,-closing.length)+signature+closing;
 return {signedXml,xmlSha256:sha256hex(xml),signedSha256:sha256hex(signedXml),signer:'mock',documentDigest,signedInfo:info,signedProperties:props};
}
/** Local simulation: deterministic, never valid for Hacienda (the value says so). */
export class MockSigner implements EinvoiceSigner{
 readonly kind='mock' as const;
 sign(xml:string,docType:EinvoiceDocType,at:Date){
  const cert={der:Buffer.from('CONTRATACR-SIMULACION-LOCAL-SIN-VALIDEZ','utf8'),issuer:'CN=Simulacion local ContrataCR,O=ContrataCR,C=CR',serial:'1'};
  const signed=envelop(xml,docType,at,cert,canonical=>Buffer.from('SIMULACION:'+createHash('sha256').update(canonical).digest('hex'),'utf8').toString('base64'),'simulacion-'+sha256hex(xml).slice(0,24));
  return {signedXml:signed.signedXml,xmlSha256:signed.xmlSha256,signedSha256:signed.signedSha256,signer:'mock' as const,documentDigest:signed.documentDigest};
 }
}
/** RFC 2253-style issuer name from Node's X509Certificate (most specific RDN first). */
export function issuerName(certificate:X509Certificate){return certificate.issuer.split('\n').filter(Boolean).reverse().join(',');}
export class XadesSigner implements EinvoiceSigner{
 readonly kind='p12' as const;
 constructor(private readonly key:KeyObject,private readonly certificate:X509Certificate,private readonly der:Buffer){}
 sign(xml:string,docType:EinvoiceDocType,at:Date){
  const cert={der:this.der,issuer:issuerName(this.certificate),serial:BigInt('0x'+this.certificate.serialNumber).toString()};
  const signed=envelop(xml,docType,at,cert,canonical=>createSign('RSA-SHA256').update(canonical,'utf8').sign(this.key,'base64'));
  return {signedXml:signed.signedXml,xmlSha256:signed.xmlSha256,signedSha256:signed.signedSha256,signer:'p12' as const,documentDigest:signed.documentDigest};
 }
}
