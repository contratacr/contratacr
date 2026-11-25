import {createElement,type ReactNode} from 'react';
import {Banknote,CalendarCheck,Clock,ExternalLink,FileText,MessageCircle,Navigation,Phone,ShoppingBag,Star,UtensilsCrossed,type LucideIcon} from 'lucide-react';
import {cn} from '@/lib/utils';
import type {PlaceAction,PlaceActionId} from '@/lib/directory/place-actions';
import {PlaceContactLink} from './place-contact-link';
import {PlaceDirectionsMenu} from './place-directions-menu';

/**
 * Renders the buttons chosen by lib/directory/place-actions.ts: the sticky bottom bar of phones (icon over label,
 * first button filled), the contact card, the header row and the result cards. Server component; only the contact
 * recorder and the directions menu are client islands.
 */
const ICONS:Record<PlaceActionId,LucideIcon>={reserve:CalendarCheck,call:Phone,whatsapp:MessageCircle,quote:FileText,order:ShoppingBag,directions:Navigation,hours:Clock,menu:UtensilsCrossed,prices:Banknote,website:ExternalLink,review:Star};
export const actionIcon=(id:PlaceActionId,className:string)=>createElement(ICONS[id],{'aria-hidden':true,className});
const ext=(a:PlaceAction)=>a.external?{target:'_blank',rel:a.id==='website'||a.id==='order'?'nofollow ugc noopener noreferrer':'noopener noreferrer'}:{};

/** One button. `children` is the visible content; `className` the look. */
export function ActionButton({action,slug,locale,className,menuVariant='pill',children,ariaLabel}:{action:PlaceAction;slug:string;locale:string;className:string;menuVariant?:'pill'|'bar';children:ReactNode;ariaLabel?:string}){
 if(action.type==='directions'&&action.maps)return <PlaceDirectionsMenu maps={action.maps} locale={locale} label={action.label} className={className} variant={menuVariant}>{children}</PlaceDirectionsMenu>;
 if(action.contact)return <PlaceContactLink slug={slug} channel={action.contact} className={className} href={action.href}>{children}</PlaceContactLink>;
 return <a data-place-action={action.id} aria-label={ariaLabel} className={className} href={action.href} {...ext(action)}>{children}</a>;
}

/** Sticky bottom bar of phones: up to four columns, icon over label. */
export function PlaceMobileBar({actions,slug,locale,label,open}:{actions:PlaceAction[];slug:string;locale:string;label:string;open?:'open'|'closed'|null}){
 if(!actions.length)return null;
 return <nav aria-label={label} data-place-mobile-bar data-place-bar-actions={actions.map(a=>a.id).join(' ')} className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e7eb] bg-white/95 px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 shadow-[0_-8px_24px_-16px_rgba(22,37,67,0.4)] backdrop-blur lg:hidden">
  <ul className="mx-auto flex max-w-md items-stretch gap-2">
   {actions.map((a,i)=><li key={a.id} className="flex min-w-0 flex-1" data-place-bar-item={a.id}>
    <ActionButton action={a} slug={slug} locale={locale} menuVariant="bar"
     className={cn('relative flex min-h-[56px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-[12px] font-bold leading-tight transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]',
      i===0?'bg-[#009FD9] text-white hover:bg-[#0089bb]':'border border-[#d7e1ea] bg-white text-[#162543] hover:bg-[#f6f9fb]')}>
     {actionIcon(a.id,'h-5 w-5 shrink-0')}
     <span className="max-w-full truncate">{a.short}</span>
     {a.id==='hours'&&open&&<span aria-hidden="true" className={cn('absolute right-2 top-2 h-2 w-2 rounded-full',open==='open'?'bg-emerald-500':'bg-red-500')}/>}
    </ActionButton></li>)}
  </ul>
 </nav>;
}
