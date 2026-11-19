import {notFound,redirect} from 'next/navigation';
import {ProSpace} from '@/components/pro/pro-space';
import {proSpaceProfile} from '@/lib/pro/pro-space-profile';
import {JOB_SECTIONS,validJobId} from '@/lib/pro/job-route';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';
export const dynamic='force-dynamic';
/**
 * Round 9: the job page is its own route and document — /dashboard/pro/trabajo/<id>[/<section>] (ES/EN).
 * The Pro space renders the job workspace directly (no dialog). Screens read the address in its query
 * form (src/lib/pro/navigation.ts translates both ways), so guards and Back/Forward stay unchanged.
 * Data access is unchanged: the job is read through the same authorized /api/pro routes.
 */
export default async function JobPage({params,searchParams}:{params:Promise<{locale:string;id:string;vista?:string[]}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(process.env.NODE_ENV!=='development')notFound();
 const {locale,id,vista}=await params,query=await searchParams;
 let job:string;try{job=decodeURIComponent(id);}catch{notFound();}
 if(!validJobId(job)||(vista?.length??0)>1)notFound();
 const section=vista?.[0];if(section&&!JOB_SECTIONS.has(section))notFound();
 const search=new URLSearchParams();for(const [key,value] of Object.entries(query))if(typeof value==='string'&&!['tab','cita'].includes(key))search.set(key,value);
 const base=prefijoDeIdioma(locale)+'/dashboard/pro/trabajo/'+encodeURIComponent(job);
 // An explicit «summary» or a section passed as a query parameter use the canonical route form.
 const querySection=search.get('vistaTrabajo');
 if(section==='summary'||querySection&&JOB_SECTIONS.has(querySection)){search.delete('vistaTrabajo');const target=querySection&&JOB_SECTIONS.has(querySection)&&querySection!=='summary'?querySection:section!=='summary'?section:undefined;redirect(base+(target?'/'+target:'')+(search.size?'?'+search:''));}
 const returnTo=base+(section?'/'+section:'')+(search.size?'?'+search:'');
 return <ProSpace profile={await proSpaceProfile(returnTo,locale)}/>;
}
