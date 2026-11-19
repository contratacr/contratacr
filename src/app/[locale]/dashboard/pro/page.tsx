import {notFound,redirect} from 'next/navigation';
import {proSpaceProfile} from '@/lib/pro/pro-space-profile';
import {ProSpace} from '@/components/pro/pro-space';
import {proJobRoutePath} from '@/lib/pro/job-route';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';
export const dynamic='force-dynamic';
/** Pro space document. Round 9: a job of the Pro space has its own route; the old query form
 * (?tab=pro_agenda&cita=<id>[&vistaTrabajo=<section>]) redirects there, keeping any other parameter. */
export default async function ProPage({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 if(process.env.NODE_ENV!=='development')notFound();
 const {locale}=await params,query=await searchParams,search=new URLSearchParams();
 for(const [key,value] of Object.entries(query))if(typeof value==='string')search.set(key,value);
 const job=proJobRoutePath(locale,search);if(job)redirect(job);
 const returnTo=prefijoDeIdioma(locale)+'/dashboard/pro'+(search.size?'?'+search:'');
 return <ProSpace profile={await proSpaceProfile(returnTo,locale)}/>;
}
