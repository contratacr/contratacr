import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createAdminClient} from '@/lib/supabase/admin';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {ProBodyError,proBoundedForm,proSameOrigin} from '@/lib/pro/route-common';
import {DOC_KINDS,MIME_FOR,validateUpload,type FileKind} from '@/lib/upload-validation';
import {cleanImageUpload} from '@/lib/media/clean-image-upload';
import {CLAIM_DOCUMENT_KINDS} from '@/lib/directory/claim-schemas';
import {placeSlugSchema} from '@/lib/directory/schemas';
import {dirDbError,dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';

export const runtime='nodejs';
// LOCAL PRO ONLY (multivertical M1, development only): one private document for a «reclamar con documentos» claim.
// multipart {claimId, kind, file}. Photo (JPEG/PNG/WebP/GIF) or PDF up to 4 MB, checked by its bytes. Images go through
// cleanImageUpload (EXIF/GPS/XMP stripped, fail closed; AVIF/HEIC refused); PDFs pass untouched, like identity documents.
// Stored in the PRIVATE bucket dir-claim-documents at dir-claims/<claimId>/<kind>-<sha16>.<ext> and registered for this
// person (dir_claim_upload_record): only the uploader can attach it to the claim, only staff can open it.
const BUCKET='dir-claim-documents',MAX=4*1024*1024;
const ALLOWED:FileKind[]=['jpeg','png','webp','gif',...DOC_KINDS];
const EXT:Partial<Record<FileKind,string>>={jpeg:'jpg',png:'png',webp:'webp',gif:'gif',pdf:'pdf'};
export async function POST(req:Request,{params}:{params:Promise<{slug:string}>}){
 const off=dirEnabledOnly();if(off)return off;
 if(!proSameOrigin(req))return dirFail(403,'origin','Origen no autorizado.');
 const limited=await enforceRateLimit(req,'dir-claim-docs',12,60_000);if(limited)return limited;
 const {slug}=await params;if(!placeSlugSchema.safeParse(slug).success)return dirFail(404,'not_found');
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión para reclamar el negocio.');
 let form:FormData;
 try{form=await proBoundedForm(req,{maxBytes:MAX+16384,maxFiles:1,maxFileBytes:MAX,fields:['claimId','kind','file']});}
 catch(e){return e instanceof ProBodyError&&e.status===413?dirFail(413,'file_too_large'):dirFail(400,'invalid');}
 const claimId=z.string().uuid().safeParse(form.get('claimId')),kind=z.enum(CLAIM_DOCUMENT_KINDS).safeParse(form.get('kind')),file=form.get('file');
 if(!claimId.success||!kind.success||!(file instanceof File))return dirFail(400,'invalid');
 const db=createAdminClient();
 const place=await db.from('dir_places').select('id').eq('slug',slug).eq('status','published').maybeSingle();
 if(place.error)return dirFail(503,'unavailable');if(!place.data)return dirFail(404,'not_found');
 const bytes=Buffer.from(await file.arrayBuffer());
 const valid=validateUpload(bytes,{allow:ALLOWED,maxBytes:MAX,allowLabel:'JPG, PNG, WebP o PDF'});
 if(!valid.ok)return dirFail(400,valid.motivo==='muy_grande'?'file_too_large':'file_format');
 const cleaned=cleanImageUpload(valid.kind,bytes);if(!cleaned.ok)return dirFail(400,cleaned.code==='formato'?'file_format':'file_metadata');
 const sha=createHash('sha256').update(cleaned.bytes).digest('hex');
 const path=`dir-claims/${claimId.data}/${kind.data}-${sha.slice(0,16)}.${EXT[valid.kind]}`;
 // Register first (ownership + caps); a retry of the same file answers the same path.
 const rec=await db.rpc('dir_claim_upload_record',{p_actor:user.id,p_input:{claimId:claimId.data,path,kind:kind.data,mime:MIME_FOR[valid.kind],size:cleaned.bytes.length,sha256:sha}});
 if(rec.error)return dirDbError(rec.error);
 const up=await db.storage.from(BUCKET).upload(path,cleaned.bytes,{contentType:MIME_FOR[valid.kind],upsert:false});
 if(up.error&&String((up.error as {statusCode?:string}).statusCode)!=='409'&&!/exists/i.test(up.error.message))return dirFail(503,'unavailable');
 return dirOk({path,kind:kind.data,name:file.name.replace(/[^\p{L}\p{N}_. -]/gu,'').slice(0,100)||'documento'});
}
