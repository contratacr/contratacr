import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {createAdminClient} from '@/lib/supabase/admin';
import {PlaceMenu} from '@/components/directory/place-menu';
import {DirectoryShell} from '@/components/directory/directory-shell';
import {placeSlugSchema} from '@/lib/directory/schemas';
import type {PublicMenu} from '@/lib/directory/menu-schemas';
import {DIR_ENABLED} from '@/lib/directory/feature-flags';

// LOCAL PRO ONLY (P2, development only, like /negocios/[slug]).
// Public menu of a published, claimed restaurant (dir_place_menu_public decides visibility; null → 404).
async function load(slug:string){
 if(!placeSlugSchema.safeParse(slug).success)return null;
 const result=await createAdminClient().rpc('dir_place_menu_public',{p_slug:slug});
 return result.error||!result.data?null:result.data as PublicMenu;
}
export const dynamic='force-dynamic';
export async function generateMetadata({params}:{params:Promise<{locale:string;slug:string}>}):Promise<Metadata>{
 if(!DIR_ENABLED)return {};
 const {locale,slug}=await params,menu=await load(slug),en=locale==='en';
 if(!menu)return {title:en?'Menu not available':'Menú no disponible',robots:{index:false,follow:false}};
 const path=`/negocios/${slug}/menu`,title=`${en?'Menu':'Menú'} · ${menu.name}`;
 const description=en?`Menu and final prices (IVA and service included) of ${menu.name}.`:`Menú y precios finales (con IVA y servicio) de ${menu.name}.`;
 const empty=menu.sections.length===0;
 return {title:`${title} | ContrataCR`,description,alternates:{canonical:(en?'/en':'')+path,languages:{es:path,en:'/en'+path}},
  openGraph:{title,description,type:'website'},robots:{index:!empty,follow:!empty}};
}
export default async function PlaceMenuRoute({params}:{params:Promise<{locale:string;slug:string}>}){
 if(!DIR_ENABLED)notFound();
 const {locale,slug}=await params,menu=await load(slug);if(!menu)notFound();
 return <DirectoryShell><PlaceMenu menu={menu} locale={locale}/></DirectoryShell>;
}
