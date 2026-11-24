'use client';
import {useLocale} from 'next-intl';
import {PromotionAdmin} from './promotion-admin';
/** Compatibility for old local preview links. Account-side requests were retired. */
export function SocialPanel({admin=false,server=false}:{admin?:boolean;server?:boolean}){
 const en=useLocale()==='en';
 return admin&&server?<PromotionAdmin/>:<p className="text-sm text-[#68778d]">{en?'ContrataCR handles promotion. When it runs, you will see it inside your profile or listing.':'La difusión la gestiona ContrataCR. Cuando se realice, podrá verla dentro de su perfil o publicación.'}</p>;
}
