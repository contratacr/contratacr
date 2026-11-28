import 'server-only';
import {createAdminClient} from '@/lib/supabase/admin';
import type {CustomerReservation} from '@/lib/directory/place-features';
import {reservationAccessToken,reservationLink} from '@/lib/directory/reservation-access';

// «Mis reservas» of a signed-in customer (dir_reservation_mine, latest 50), for the /mis-reservas page and the «Mi panel»
// section (GET /api/mis-reservas). Each row carries only the private link /reserva/<token>, derived here on the server:
// the reservation id never leaves this function.
export type MyReservationRow=Omit<CustomerReservation,'timeline'|'revision'|'name'|'createdAt'>&{href:string|null};
export async function loadMyReservations(userId:string,locale:string):Promise<MyReservationRow[]|null>{
 const r=await createAdminClient().rpc('dir_reservation_mine',{p_actor:userId});
 if(r.error)return null;
 return Promise.all(((r.data??[]) as (CustomerReservation&{id:string})[]).map(async({id,reference,kind,status,day,time,partySize,placeName,placeSlug,position,canCancel})=>{
  const tok=await reservationAccessToken(id);
  return {reference,kind,status,day,time,partySize,placeName,placeSlug,position,canCancel,href:tok?reservationLink(tok,locale):null};
 }));
}
