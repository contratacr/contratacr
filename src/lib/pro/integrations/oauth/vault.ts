import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

/**
 * Round 6B: token vault. OAuth tokens (and the PKCE verifier while a connection is pending) are stored ONLY
 * as AES-256-GCM envelopes: «v1.<key id>.<iv b64url 12 bytes>.<tag b64url 16 bytes>.<ciphertext b64url>».
 * SQL (pro_oauth_box_ok) rejects any other shape, so a plaintext token cannot reach the database.
 *
 * Keys: «env» = PRO_OAUTH_TOKEN_KEY (32 random bytes, base64 or 64 hex chars) — required by every sandbox /
 * production connection. «mock» = a FIXED, PUBLIC test key that only encrypts the fake tokens of the local
 * mock authorization server (those tokens open nothing). A mock key can never decrypt a real token, and a
 * real connection never uses it.
 */
export type VaultKeyId='mock'|'env';
const MOCK_KEY=createHash('sha256').update('ccr-local-mock-oauth-vault-v1 (public test key, mock tokens only)').digest();
export class VaultError extends Error{constructor(message:string){super(message);this.name='VaultError';}}
export function vaultKey(id:VaultKeyId,env:Record<string,string|undefined>=process.env):Buffer{
 if(id==='mock')return MOCK_KEY;
 const raw=env.PRO_OAUTH_TOKEN_KEY?.trim();if(!raw)throw new VaultError('PRO_OAUTH_TOKEN_KEY no está configurada.');
 const key=/^[0-9a-f]{64}$/i.test(raw)?Buffer.from(raw,'hex'):Buffer.from(raw,'base64');
 if(key.length!==32)throw new VaultError('PRO_OAUTH_TOKEN_KEY debe tener 32 bytes (base64 o 64 caracteres hex).');
 return key;
}
export function seal(plain:string,id:VaultKeyId,env?:Record<string,string|undefined>){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',vaultKey(id,env),iv);
 cipher.setAAD(Buffer.from('ccr-oauth-v1:'+id));
 const data=Buffer.concat([cipher.update(plain,'utf8'),cipher.final()]),tag=cipher.getAuthTag();
 return `v1.${id}.${iv.toString('base64url')}.${tag.toString('base64url')}.${data.toString('base64url')}`;
}
export function open(box:string,env?:Record<string,string|undefined>){
 const parts=box.split('.');
 if(parts.length!==5||parts[0]!=='v1'||(parts[1]!=='mock'&&parts[1]!=='env'))throw new VaultError('Sobre cifrado no válido.');
 const id=parts[1] as VaultKeyId,decipher=createDecipheriv('aes-256-gcm',vaultKey(id,env),Buffer.from(parts[2]!,'base64url'));
 decipher.setAAD(Buffer.from('ccr-oauth-v1:'+id));decipher.setAuthTag(Buffer.from(parts[3]!,'base64url'));
 try{return Buffer.concat([decipher.update(Buffer.from(parts[4]!,'base64url')),decipher.final()]).toString('utf8');}
 catch{throw new VaultError('No se pudo descifrar (llave distinta o sobre alterado).');}
}
export const boxKeyId=(box:string):VaultKeyId|null=>{const id=box.split('.')[1];return id==='mock'||id==='env'?id:null;};
/** PKCE (RFC 7636) with S256 and an opaque state. Only sha256(state) is stored. */
export function pkcePair(){const verifier=randomBytes(48).toString('base64url');return {verifier,challenge:createHash('sha256').update(verifier).digest('base64url')};}
export const pkceChallenge=(verifier:string)=>createHash('sha256').update(verifier).digest('base64url');
export const newState=()=>randomBytes(32).toString('base64url');
export const stateHash=(state:string)=>createHash('sha256').update('ccr-oauth-state:v1:'+state,'utf8').digest('hex');
