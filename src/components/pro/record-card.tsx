'use client';
import type {ReactNode} from 'react';
import type {LucideIcon} from 'lucide-react';
import {ChevronRight} from 'lucide-react';
import {Card} from '@/components/ui/card';
import {Button} from '@/components/ui/button';
import {CardActionsMenu,type CardAction} from '@/components/dashboard/card-actions-menu';

/** Uses the panel's existing project card, icon tile and separated action row. */
export function ProRecordCard({icon:Icon,title,subtitle,meta,amount,onOpen,openLabel,openAriaLabel,onEdit,editLabel,actions,actionsLabel,disabled=false}:{
 icon:LucideIcon;title:string;subtitle?:ReactNode;meta?:ReactNode;amount?:ReactNode;
 onOpen:()=>void;openLabel:string;openAriaLabel?:string;onEdit?:()=>void;editLabel?:string;
 actions?:CardAction[];actionsLabel?:string;disabled?:boolean;
}){
 return <Card data-pro-record-card className="overflow-hidden"><article>
  <button type="button" disabled={disabled} onClick={onOpen} aria-label={openAriaLabel} className="group flex w-full items-start gap-3.5 rounded-t-2xl p-4 text-left transition-colors hover:bg-[#f9fbfd] disabled:opacity-60 sm:p-5">
   <span className="ccr-caja-icono-plana grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl"><Icon aria-hidden className="h-5 w-5"/></span>
   <span className="min-h-11 min-w-0 flex-1 whitespace-normal px-3 leading-snug">
    <h3 className="break-words text-[15px] font-bold leading-snug text-[#162543] sm:text-base">{title}</h3>
    {subtitle&&<span className="mt-1 block break-words text-[13px] text-[#52627a]">{subtitle}</span>}
    {meta&&<span className="mt-1 block break-words text-xs text-[#68778d]">{meta}</span>}
    {amount&&<span className="mt-2 block text-sm font-bold text-[#162543]">{amount}</span>}
   </span>
   <ChevronRight aria-hidden className="mt-1 h-4 w-4 shrink-0 text-[#009FD9]"/>
  </button>
  <div className="mx-4 flex items-center gap-2 border-t border-[#eef2f6] py-4 sm:mx-5">
   <Button variant="secondary" disabled={disabled} onClick={onOpen} className="min-h-11 min-w-0 flex-1 whitespace-normal px-3 leading-snug">{openLabel}</Button>
   {onEdit&&<Button disabled={disabled} onClick={onEdit} className="min-h-11 min-w-0 flex-1 whitespace-normal px-3 leading-snug">{editLabel}</Button>}
   {!!actions?.length&&<CardActionsMenu label={actionsLabel??title} actions={disabled?[]:actions} triggerClassName="border-0 hover:border-transparent"/>}
  </div>
 </article></Card>;
}
