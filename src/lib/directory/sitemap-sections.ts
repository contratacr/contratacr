import {PLACE_SECTIONS} from './place-verticals';
import {DIR_ENABLED,DIR_HEALTH_ENABLED} from './feature-flags';

// SEO (2026-11-18): the directory sections that may appear in the sitemaps — only while the directory is on, without
// «Salud» while DIR_HEALTH_ENABLED is off and without the classified-listing sections (vehículos/inmuebles, OFF).
// Used by [locale]/layout.tsx (navbar sections, components/site-features.tsx), src/app/sitemap.ts (section pages), src/app/sitemap-directorio/sitemap.ts (one place sitemap per section)
// and src/app/robots.ts (sitemap list).
export function sitemapSections(){
 if(!DIR_ENABLED)return [];
 // PLACE_SECTIONS never includes the classified-listing pages (/vehiculos, /inmuebles).
 return PLACE_SECTIONS.filter(s=>DIR_HEALTH_ENABLED||s.id!=='health');
}
