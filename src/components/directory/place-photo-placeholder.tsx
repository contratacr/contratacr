import {createElement} from 'react';
import type {LucideIcon} from 'lucide-react';
import {sectionIconForVertical} from '@/lib/visuals/section-visuals';

/**
 * Launch decision (2026-11-18): no stock photos. Owners and customers upload them. A place without photos shows this
 * calm, intentional placeholder (the section icon on a soft panel + one line of text), never a broken image.
 */
/** The section's one icon (lib/visuals/section-visuals.ts); kept for existing importers. */
export const placeVerticalIcon=(verticalId:string):LucideIcon=>sectionIconForVertical(verticalId);
export function PlacePhotoPlaceholder({verticalId,en,claimed}:{verticalId:string;en:boolean;claimed:boolean}){
 return <div data-place-photo-placeholder={verticalId} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-[#eaf6fb] to-[#f7fafc] p-4 text-[#162543]">
  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-[#0b7fab] shadow-sm">{createElement(placeVerticalIcon(verticalId),{'aria-hidden':true,className:'h-7 w-7'})}</span>
  <p className="text-sm text-slate-700">{claimed
   ?(en?'No photos yet. The business and its customers can add them with "Add photos".':'Todavía no hay fotos. El negocio y sus clientes pueden agregarlas con "Agregar fotos".')
   :(en?'No photos yet. If you have been here, add the first one with "Add photos".':'Todavía no hay fotos. Si usted visitó este lugar, agregue la primera con "Agregar fotos".')}</p>
 </div>;
}
