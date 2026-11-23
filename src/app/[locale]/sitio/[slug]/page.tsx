import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {SitePage} from '@/components/pro/site-page';
import type {PublicSite} from '@/lib/pro/site';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6D (row 69): public website of a professional, LOCAL development only (reserved path /sitio/<slug>,
// like the bid portal and /pagar). Only the latest PUBLISHED version is served; drafts never are.
async function load(slug:string){
 if(!/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/.test(slug))return null;
 const result=await createAdminClient().rpc('pro_site_public',{p_slug:slug});
 return result.error||!result.data?null:result.data as PublicSite;
}
export async function generateMetadata({params}:{params:Promise<{locale:string;slug:string}>}):Promise<Metadata>{
 if(!PRO_ENABLED)return {};
 const {slug}=await params,site=await load(slug);if(!site)return {title:'Sitio no disponible',robots:{index:false,follow:false}};
 const path='/sitio/'+slug;
 return {title:{absolute:site.content.title},description:site.content.description,alternates:{canonical:(site.content.language==='en'?'/en':'')+path,languages:{es:path,en:'/en'+path}},
  openGraph:{title:site.content.title,description:site.content.description,type:'website'},robots:{index:true,follow:true}};
}
export default async function ProfessionalSitePage({params}:{params:Promise<{locale:string;slug:string}>}){
 if(!PRO_ENABLED)notFound();
 const {slug}=await params,site=await load(slug);if(!site)notFound();
 return <SitePage site={site}/>;
}
