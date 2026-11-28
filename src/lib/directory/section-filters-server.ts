import 'server-only';
import {unstable_cache} from 'next/cache';
import {createAdminClient} from '@/lib/supabase/admin';
import type {SectionFilterStats} from './section-filters';

// LOCAL PRO ONLY (2026-11-27): chip data of a place section (dir_section_filter_stats, migration 546), cached 10 minutes
// per section so the section page does not count the whole section on every visit. null on any problem: the page then
// shows only the filters that need no list (and hides «Abierto ahora», which needs the hours coverage).
const cached=unstable_cache(async(section:string):Promise<SectionFilterStats|null>=>{
 const {data,error}=await createAdminClient().rpc('dir_section_filter_stats',{p_vertical:section});
 // Thrown (not returned) so a failure is never cached.
 if(error){console.error('[directorio] filter stats failed',(error as {code?:string}).code);throw new Error('dir_section_filter_stats');}
 return data as SectionFilterStats;
},['dir-section-filter-stats-v1'],{revalidate:600});

export async function loadSectionFilterStats(section:string):Promise<SectionFilterStats|null>{
 try{return await cached(section);}catch{return null;}
}
