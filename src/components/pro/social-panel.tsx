'use client';
import {PromotionAdmin} from './promotion-admin';
/** Compatibility for old local preview links. Account-side requests were retired. */
export function SocialPanel({admin=false,server=false}:{admin?:boolean;server?:boolean}){
 return admin&&server?<PromotionAdmin/>:<p className="text-sm text-[#68778d]">La difusión la gestiona ContrataCR. Cuando se realice, podrá verla dentro de su perfil o publicación.</p>;
}
