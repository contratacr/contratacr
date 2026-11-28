import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/supabase/get-user';
import {enforceRateLimit} from '@/lib/rate-limit';
import {dirEnabledOnly,dirFail,dirOk} from '@/lib/directory/public-route';
import {loadMyReservations} from '@/lib/directory/my-reservations';

// «Mis reservas» for the «Mi panel» section (directory on only). Same rows as /mis-reservas: private links, never ids.
export async function GET(req:Request){
 const off=dirEnabledOnly();if(off)return off;
 const limited=await enforceRateLimit(req,'dir-reservations-mine',60,60_000);if(limited)return limited;
 const user=await safeGetUser(await createClient());if(!user)return dirFail(401,'login','Inicie sesión.');
 const locale=new URL(req.url).searchParams.get('locale')==='en'?'en':'es';
 const rows=await loadMyReservations(user.id,locale);
 return rows?dirOk({items:rows}):dirFail(500,'db','No se pudieron cargar sus reservas.');
}
