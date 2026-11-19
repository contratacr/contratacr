/**
 * Request bodies with REAL byte limits (post-security fixes, 2026-11-13). `Content-Length` is only a hint that can be
 * absent (chunked) or false, so the body is read as a stream and refused the moment it passes the limit; nothing
 * beyond it is buffered. Shared by `proBoundedJson` (route-common.ts) and the form/multipart routes (AI, meeting
 * recordings, mock e-sign). Pure: no Next or Supabase imports, so it is unit-tested without a server.
 */
export class ProBodyError extends Error{
 constructor(readonly status:400|413|415,readonly reason:'too_large'|'invalid'|'too_many_files'|'unexpected_field'|'unsupported_type'){super(reason);}
}
/** Reads at most `limit` bytes of the body; RangeError as soon as it is larger (the stream is cancelled). */
export async function readBoundedBody(req:Request,limit:number):Promise<Uint8Array>{
 const declared=req.headers.get('content-length');
 if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>limit))throw new RangeError('too_large');
 const reader=req.body?.getReader();if(!reader)return new Uint8Array(0);
 const chunks:Uint8Array[]=[];let length=0;
 try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>limit){await reader.cancel().catch(()=>{});throw new RangeError('too_large');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export type BoundedFormOptions={maxBytes:number;maxFiles:number;fields:readonly string[];types?:readonly string[];maxFileBytes?:number};
/**
 * multipart/form-data (or url-encoded) body with: a streamed byte cap for the whole body, an allow-list of field
 * names (each at most once), at most `maxFiles` file parts and, per file, at most `maxFileBytes`.
 */
export async function proBoundedForm(req:Request,options:BoundedFormOptions):Promise<FormData>{
 const type=(req.headers.get('content-type')??'').toLowerCase(),types=options.types??['multipart/form-data'];
 if(!types.some(prefix=>type.startsWith(prefix)))throw new ProBodyError(415,'unsupported_type');
 let bytes:Uint8Array;
 try{bytes=await readBoundedBody(req,options.maxBytes);}catch(error){throw error instanceof RangeError?new ProBodyError(413,'too_large'):new ProBodyError(400,'invalid');}
 let form:FormData;
 try{form=await new Response(bytes as BodyInit,{headers:{'content-type':req.headers.get('content-type')!}}).formData();}catch{throw new ProBodyError(400,'invalid');}
 const seen=new Set<string>();let files=0;
 for(const [name,value] of form.entries()){
  if(!options.fields.includes(name)||seen.has(name))throw new ProBodyError(400,'unexpected_field');
  seen.add(name);
  if(typeof value!=='string'){files++;if(files>options.maxFiles)throw new ProBodyError(400,'too_many_files');if(options.maxFileBytes!==undefined&&value.size>options.maxFileBytes)throw new ProBodyError(413,'too_large');}
 }
 return form;
}
const startsWith=(bytes:Uint8Array,signature:readonly number[],at=0)=>bytes.length>=at+signature.length&&signature.every((value,index)=>bytes[at+index]===value);
const ascii=(text:string)=>[...text].map(c=>c.charCodeAt(0));
/** Image type from the file's first bytes (JPEG, PNG, WebP), whatever the browser declared; null otherwise. */
export function sniffImage(bytes:Uint8Array):'image/jpeg'|'image/png'|'image/webp'|null{
 if(startsWith(bytes,[0xff,0xd8,0xff]))return 'image/jpeg';
 if(startsWith(bytes,[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))return 'image/png';
 if(startsWith(bytes,ascii('RIFF'))&&startsWith(bytes,ascii('WEBP'),8))return 'image/webp';
 return null;
}
/** Audio container from the file's first bytes (WebM, Ogg, MP3, MP4/M4A, WAV, AAC); null otherwise. */
export function sniffAudio(bytes:Uint8Array):'audio/webm'|'audio/ogg'|'audio/mpeg'|'audio/mp4'|'audio/wav'|'audio/aac'|null{
 if(startsWith(bytes,[0x1a,0x45,0xdf,0xa3]))return 'audio/webm';
 if(startsWith(bytes,ascii('OggS')))return 'audio/ogg';
 if(startsWith(bytes,ascii('ftyp'),4))return 'audio/mp4';
 if(startsWith(bytes,ascii('RIFF'))&&startsWith(bytes,ascii('WAVE'),8))return 'audio/wav';
 if(startsWith(bytes,ascii('ID3')))return 'audio/mpeg';
 if(bytes.length>=2&&bytes[0]===0xff&&(bytes[1]!&0xf6)===0xf0)return 'audio/aac';
 if(bytes.length>=2&&bytes[0]===0xff&&(bytes[1]!&0xe0)===0xe0&&(bytes[1]!&0x06)!==0)return 'audio/mpeg';
 return null;
}
