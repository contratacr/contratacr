import {DIRECTORY_LISTINGS_ENABLED} from '@/lib/directory/feature-flags';
import {notFound,redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {ListingInventory} from '@/components/pro/listing-inventory';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';

// LOCAL PRO ONLY (V2/R2, development only): Pro inventory of property listings. Access and module
// (edition bienes raíces → property_inventory) are checked by /api/pro/dir-listings.
export const dynamic='force-dynamic';
export default async function InventoryRoute({params}:{params:Promise<{locale:string}>}){
 // Classified listings are OFF by owner decision (feature-flags.ts): 404 while the flag is off.
 if(process.env.NODE_ENV!=='development'||!DIRECTORY_LISTINGS_ENABLED)notFound();
 const {locale}=await params,prefix=prefijoDeIdioma(locale),user=await safeGetUser(await createClient());
 if(!user)redirect(prefix+'/login?redirect='+encodeURIComponent(prefix+'/dashboard/pro/inventario/inmuebles'));
 return <main id="contenido" className="mx-auto max-w-4xl px-4 py-6 sm:py-10"><ListingInventory vertical="inmuebles"/></main>;
}
