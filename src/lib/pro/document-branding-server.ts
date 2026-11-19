import 'server-only';
import {createHash} from 'node:crypto';
import type {createAdminClient} from '@/lib/supabase/admin';
import {documentBrandingSchema,type PrintBranding} from './document-branding';
export const DOCUMENT_LOGO_BUCKET='pro-document-logos';
/** Branding of the document's owner for a print route (the route already authorised the document).
 * The logo is read from the private bucket and checked against its SHA-256 before embedding. */
export async function loadPrintBranding(db:ReturnType<typeof createAdminClient>,owner:string|null|undefined):Promise<PrintBranding|null>{
 if(!owner)return null;
 try{
  const r=await db.rpc('pro_document_branding_for_print',{p_owner:owner});
  const b=r.error||!r.data?null:documentBrandingSchema.parse(r.data);let logoDataUri:string|null=null;
  if(b?.logo){const file=await db.storage.from(DOCUMENT_LOGO_BUCKET).download(b.logo.path);if(!file.error&&file.data){const bytes=Buffer.from(await file.data.arrayBuffer());if(bytes.length===b.logo.bytes&&createHash('sha256').update(bytes).digest('hex')===b.logo.sha256)logoDataUri='data:image/jpeg;base64,'+bytes.toString('base64');}}
  // Fix 13: without saved branding (or without a name) the header still names the company, not only ContrataCR.
  const company=b&&b.revision>0&&b.displayName.trim()?'':await companyName(db,owner);
  if(!b||b.revision===0)return company?{theme:'celeste',displayName:company,tagline:'',footer:'',logoDataUri:null}:null;
  return {theme:b.theme,displayName:b.displayName.trim()||company,tagline:b.tagline,footer:b.footer,logoDataUri,template:b.template};
 }catch{return null;}
}
/** Business name of the professional profile, else the account name (no e-mail or other personal data). */
async function companyName(db:ReturnType<typeof createAdminClient>,owner:string){
 const pro=await db.from('professionals').select('business_name').eq('profile_id',owner).order('id').limit(1).maybeSingle();
 const name=typeof pro.data?.business_name==='string'?pro.data.business_name.trim():'';if(name)return name.slice(0,120);
 const profile=await db.from('profiles').select('full_name').eq('id',owner).maybeSingle();
 return typeof profile.data?.full_name==='string'?profile.data.full_name.trim().slice(0,120):'';
}
