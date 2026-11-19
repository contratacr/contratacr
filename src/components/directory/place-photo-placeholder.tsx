import {createElement} from 'react';
import {Building2,Car,Coffee,Dumbbell,Fuel,Hammer,BedDouble,Landmark,MapPinned,PawPrint,Pill,Scissors,ShoppingCart,Stethoscope,Store,UtensilsCrossed,Wrench,type LucideIcon} from 'lucide-react';

/**
 * Launch decision (2026-11-18): no stock photos. Owners and customers upload them. A place without photos shows this
 * calm, intentional placeholder (the section icon on a soft panel + one line of text), never a broken image.
 */
const ICONS:Record<string,LucideIcon>={restaurant:UtensilsCrossed,cafe_bar:Coffee,fuel:Fuel,pharmacy:Pill,grocery:ShoppingCart,convenience:Store,
 hardware:Hammer,lodging:BedDouble,health:Stethoscope,vet_pets:PawPrint,auto_services:Wrench,beauty:Scissors,fitness:Dumbbell,tours:MapPinned,
 banking:Landmark,vehicle_dealer:Car,real_estate:Building2};
export const placeVerticalIcon=(verticalId:string):LucideIcon=>ICONS[verticalId]??Store;
export function PlacePhotoPlaceholder({verticalId,en,claimed}:{verticalId:string;en:boolean;claimed:boolean}){
 return <div data-place-photo-placeholder={verticalId} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-[#eaf6fb] to-[#f7fafc] p-4 text-[#162543]">
  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-[#0b7fab] shadow-sm">{createElement(placeVerticalIcon(verticalId),{'aria-hidden':true,className:'h-7 w-7'})}</span>
  <p className="text-sm text-slate-700">{claimed
   ?(en?'No photos yet. The business and its customers can add them with «Add photos».':'Todavía no hay fotos. El negocio y sus clientes pueden agregarlas con «Agregar fotos».')
   :(en?'No photos yet. If you have been here, add the first one with «Add photos».':'Todavía no hay fotos. Si usted visitó este lugar, agregue la primera con «Agregar fotos».')}</p>
 </div>;
}
