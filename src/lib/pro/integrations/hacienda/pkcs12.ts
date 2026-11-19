import {createDecipheriv,createHash,createHmac,createPrivateKey,pbkdf2Sync,timingSafeEqual,X509Certificate,type KeyObject} from 'node:crypto';

/**
 * Round 6A: minimal PKCS#12 (.p12) reader for the Hacienda «llave criptográfica» — no dependency.
 * Supports what ATV/OpenSSL/LibreSSL/Java produce: PBE-SHA1-3DES, PBE-SHA1-RC2-40/128 (RC2 in JS: Node's
 * OpenSSL 3 no longer ships it), PBES2 (PBKDF2 + AES-CBC/3DES), DER and BER (indefinite lengths), and the
 * HMAC-SHA1/SHA-256 integrity MAC. Only the SANDBOX/PRODUCTION signer uses it, reading a path and PIN
 * from environment variables; the private key never leaves process memory.
 */
type Node={tag:number;start:number;end:number;header:number;children?:Node[];buf:Buffer};
function parse(buf:Buffer,offset=0,end=buf.length):Node[]{
 const out:Node[]=[];
 while(offset<end){
  const tag=buf[offset]!;if(tag===0&&buf[offset+1]===0)break;
  let len=buf[offset+1]!,header=2,indefinite=false;
  if(len===0x80){indefinite=true;len=0;}
  else if(len&0x80){const n=len&0x7f;len=0;for(let i=0;i<n;i++)len=len*256+buf[offset+2+i]!;header=2+n;}
  const constructed=(tag&0x20)!==0;let node:Node;
  if(indefinite){
   const children=parse(buf,offset+header,end);let last=children.length?children[children.length-1]!.end:offset+header;
   last+=2;node={tag,start:offset,end:last,header,children,buf};
  }else{
   node={tag,start:offset,end:offset+header+len,header,buf};
   if(constructed)node.children=parse(buf,offset+header,offset+header+len);
  }
  out.push(node);offset=node.end;
 }
 return out;
}
const content=(node:Node):Buffer=>{
 if(node.children&&(node.tag===0x24||node.tag===0xa0&&node.children.every(child=>child.tag===0x04)))return Buffer.concat(node.children.map(content));
 const indefinite=node.buf[node.start+1]===0x80;
 return node.buf.subarray(node.start+node.header,indefinite?node.end-2:node.end);
};
const kids=(node:Node)=>node.children??parse(content(node));
function oid(node:Node){
 const bytes=content(node),parts=[Math.floor(bytes[0]!/40),bytes[0]!%40];let value=0;
 for(const byte of bytes.subarray(1)){value=value*128+(byte&0x7f);if(!(byte&0x80)){parts.push(value);value=0;}}
 return parts.join('.');
}
const int=(node:Node)=>{let v=0;for(const byte of content(node))v=v*256+byte;return v;};
const explicit=(node:Node)=>kids(node)[0]!;

// RC2 (RFC 2268) — decrypt only.
const PI=Buffer.from('d978f9c419ddb5ed28e9fd794aa0d89dc67e37832b76538e624c6488448bfba2179a59f587b34f1361456d8d09817d32bd8f40eb86b77b0bf09521225c6b4e8254d66593ce60b21c7356c014a78cf1dc1275ca1f3bbee4d1423dd430a33cb6266fbf0eda4669075727f21d9bbc944303f811c7f690ef3ee706c3d52fc8661ed708e8eade8052eef784aa72ac354d6a2a961ad2715a1549744b9fd05e0418a4ecc2e0416e0f51cbcc2491af50a1f47039997c3a8523b8b47afc02365b25559731 2d5dfa98e38a92ae05df2910676cbac9d300e6cfe19ea82c6316013f58e289a90d38341bab33ffb0bb480c5fb9b1cd2ec5f3db47e5a59c770aa62068fe7fc1ad'.replace(/\s/g,''),'hex');
function rc2Keys(key:Buffer,bits:number){
 const L=Buffer.alloc(128);key.copy(L);const T=key.length;
 for(let i=T;i<128;i++)L[i]=PI[(L[i-1]!+L[i-T]!)&255]!;
 const T8=Math.ceil(bits/8),TM=255%(1<<(8+bits-8*T8));
 L[128-T8]=PI[L[128-T8]!&TM]!;
 for(let i=127-T8;i>=0;i--)L[i]=PI[L[i+1]!^L[i+T8]!]!;
 const K=new Uint16Array(64);for(let i=0;i<64;i++)K[i]=L[2*i]!+256*L[2*i+1]!;return K;
}
function rc2DecryptCbc(key:Buffer,bits:number,iv:Buffer,data:Buffer){
 const K=rc2Keys(key,bits),out=Buffer.alloc(data.length);let prev=iv;
 const s=[1,2,3,5];
 for(let off=0;off<data.length;off+=8){
  const block=data.subarray(off,off+8),R=[block.readUInt16LE(0),block.readUInt16LE(2),block.readUInt16LE(4),block.readUInt16LE(6)];let j=63;
  const rmix=()=>{for(let i=3;i>=0;i--){const r=R[i]!&0xffff;R[i]=((r>>>s[i]!)|(r<<(16-s[i]!)))&0xffff;R[i]=(R[i]!-K[j]!-(R[(i+3)%4]!&R[(i+2)%4]!)-(~R[(i+3)%4]!&R[(i+1)%4]!))&0xffff;j--;}};
  const rmash=()=>{for(let i=3;i>=0;i--)R[i]=(R[i]!-K[R[(i+3)%4]!&63]!)&0xffff;};
  for(let n=0;n<5;n++)rmix();rmash();for(let n=0;n<6;n++)rmix();rmash();for(let n=0;n<5;n++)rmix();
  for(let i=0;i<4;i++)out.writeUInt16LE(R[i]!^prev.readUInt16LE(2*i),off+2*i);
  prev=block;
 }
 const pad=out[out.length-1]!;if(pad<1||pad>8)throw Error('bad padding');return out.subarray(0,out.length-pad);
}
// PKCS#12 key derivation (RFC 7292 B.2), SHA-1.
function bmp(password:string){const out=Buffer.alloc((password.length+1)*2);for(let i=0;i<password.length;i++)out.writeUInt16BE(password.charCodeAt(i),2*i);return out;}
function p12kdf(password:string,salt:Buffer,id:number,iterations:number,n:number){
 const v=64,u=20,D=Buffer.alloc(v,id),pw=bmp(password);
 const fill=(src:Buffer)=>{const len=v*Math.ceil(src.length/v);const out=Buffer.alloc(len);for(let i=0;i<len;i++)out[i]=src[i%src.length]!;return out;};
 const I=Buffer.concat([salt.length?fill(salt):Buffer.alloc(0),pw.length?fill(pw):Buffer.alloc(0)]),out:Buffer[]=[];
 for(let produced=0;produced<n;produced+=u){
  let A=createHash('sha1').update(Buffer.concat([D,I])).digest();for(let i=1;i<iterations;i++)A=createHash('sha1').update(A).digest();
  out.push(A);const B=fill(A);
  for(let j=0;j<I.length;j+=v){let carry=1;for(let k=v-1;k>=0;k--){const sum=I[j+k]!+B[k]!+carry;I[j+k]=sum&255;carry=sum>>8;}}
 }
 return Buffer.concat(out).subarray(0,n);
}
function decrypt(alg:Node,data:Buffer,password:string){
 const [idNode,params]=kids(alg),id=oid(idNode!);
 if(id.startsWith('1.2.840.113549.1.12.1.')){
  const [saltNode,iterNode]=kids(params!),salt=content(saltNode!),iter=int(iterNode!);
  if(id==='1.2.840.113549.1.12.1.3'){const d=createDecipheriv('des-ede3-cbc',p12kdf(password,salt,1,iter,24),p12kdf(password,salt,2,iter,8));return Buffer.concat([d.update(data),d.final()]);}
  if(id==='1.2.840.113549.1.12.1.6')return rc2DecryptCbc(p12kdf(password,salt,1,iter,5),40,p12kdf(password,salt,2,iter,8),data);
  if(id==='1.2.840.113549.1.12.1.5')return rc2DecryptCbc(p12kdf(password,salt,1,iter,16),128,p12kdf(password,salt,2,iter,8),data);
 }
 if(id==='1.2.840.113549.1.5.13'){
  const [kdf,scheme]=kids(params!),[,kdfParams]=kids(kdf!),fields=kids(kdfParams!);
  const salt=content(fields[0]!),iter=int(fields[1]!);let prf='sha1';
  for(const field of fields.slice(2))if(field.tag===0x30){const prfId=oid(kids(field)[0]!);prf=prfId==='1.2.840.113549.2.9'?'sha256':prfId==='1.2.840.113549.2.11'?'sha512':'sha1';}
  const [schemeId,iv]=kids(scheme!),sid=oid(schemeId!);
  const cipher=sid==='2.16.840.1.101.3.4.1.42'?['aes-256-cbc',32]:sid==='2.16.840.1.101.3.4.1.2'?['aes-128-cbc',16]:sid==='2.16.840.1.101.3.4.1.22'?['aes-192-cbc',24]:sid==='1.2.840.113549.3.7'?['des-ede3-cbc',24]:null;
  if(!cipher)throw Error('unsupported PBES2 cipher');
  const key=pbkdf2Sync(Buffer.from(password,'utf8'),salt,iter,cipher[1] as number,prf),d=createDecipheriv(cipher[0] as string,key,content(iv!));
  return Buffer.concat([d.update(data),d.final()]);
 }
 throw Error('unsupported PKCS#12 algorithm '+id);
}
export type P12Material={key:KeyObject;certificate:X509Certificate;certificateDer:Buffer};
export class P12Error extends Error{constructor(message:string){super(message);this.name='P12Error';}}
export function readPkcs12(file:Buffer,password:string):P12Material{
 let pfx:Node;try{pfx=parse(file)[0]!;}catch{throw new P12Error('El archivo .p12 no es válido.');}
 const [,authSafe,macData]=kids(pfx);
 const authContent=content(explicit(kids(authSafe!)[1]!));
 if(macData){
  const [digestInfo,saltNode,iterNode]=kids(macData),[algNode,macNode]=kids(digestInfo!),alg=oid(kids(algNode!)[0]!);
  const hash=alg==='2.16.840.1.101.3.4.2.1'?'sha256':'sha1',size=hash==='sha256'?32:20;
  const salt=content(saltNode!),iter=iterNode?int(iterNode):1;
  // PKCS#12 MAC key uses the same KDF with id 3 (SHA-1 variant; SHA-256 MACs from OpenSSL 3 use their own size).
  const macKey=hash==='sha1'?p12kdf(password,salt,3,iter,size):pbkdf2Sync(Buffer.from(password,'utf8'),salt,iter,size,hash);
  const expected=createHmac(hash,macKey).update(authContent).digest(),given=content(macNode!);
  if(hash==='sha1'&&(expected.length!==given.length||!timingSafeEqual(expected,given)))throw new P12Error('El PIN del .p12 no es correcto.');
 }
 let keyDer:Buffer|null=null;const certs:Buffer[]=[];
 for(const info of kids(parse(authContent)[0]!)){
  const [typeNode,body]=kids(info),type=oid(typeNode!);let safe:Buffer;
  if(type==='1.2.840.113549.1.7.1')safe=content(explicit(body!));
  else if(type==='1.2.840.113549.1.7.6'){
   const encInfo=kids(explicit(body!))[1]!,[,alg,data]=kids(encInfo);
   try{safe=decrypt(alg!,content(data!),password);}catch(error){if(error instanceof P12Error)throw error;throw new P12Error('No se pudo abrir el .p12 (PIN incorrecto o cifrado no compatible).');}
  }else continue;
  for(const bag of kids(parse(safe)[0]!)){
   const [bagId,value]=kids(bag),id=oid(bagId!),inner=explicit(value!);
   if(id==='1.2.840.113549.1.12.10.1.2'){const [alg,data]=kids(inner);try{keyDer=decrypt(alg!,content(data!),password);}catch{throw new P12Error('No se pudo abrir la llave del .p12 (PIN incorrecto).');}}
   else if(id==='1.2.840.113549.1.12.10.1.1')keyDer=inner.buf.subarray(inner.start,inner.end);
   else if(id==='1.2.840.113549.1.12.10.1.3'){const [certType,certValue]=kids(inner);if(oid(certType!)==='1.2.840.113549.1.9.22.1')certs.push(content(explicit(certValue!)));}
  }
 }
 if(!keyDer||!certs.length)throw new P12Error('El .p12 no contiene llave y certificado.');
 const key=createPrivateKey({key:keyDer,format:'der',type:'pkcs8'});
 // The signing certificate is the one whose public key matches the private key.
 for(const der of certs){const certificate=new X509Certificate(der);if(certificate.checkPrivateKey(key))return {key,certificate,certificateDer:der};}
 throw new P12Error('Ningún certificado del .p12 corresponde a su llave.');
}
