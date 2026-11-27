"use client";

import { useState } from "react";
import { BriefcaseBusiness, ChevronLeft, HardHat, Store, UserRoundSearch } from "lucide-react";

export type WelcomeRole = "client" | "professional" | "business";

// Also rendered before hydration: first paint and interactive welcome match.
// businessOption (directory on, 2026-11-27): «Profesional» asks one more thing, like /registro — «Profesional
// independiente» (role professional) or «Empresa o local» (role business → /registro/empresa).
export function WelcomeChoiceContent({english=false,onChoose,onLogin,titleId,businessOption=false}:{english?:boolean;onChoose?:(role:WelcomeRole)=>void;onLogin?:()=>void;titleId?:string;businessOption?:boolean}) {
  const [proStep,setProStep]=useState(false);
  if(businessOption&&proStep)return <div className="w-full max-w-2xl" data-welcome-pro-kind>
    <div className="mb-8 text-center">
      <button type="button" onClick={()=>setProStep(false)} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[#009FD9] hover:underline"><ChevronLeft className="h-4 w-4" aria-hidden/>{english?"Back":"Volver"}</button>
      <h1 id={titleId} className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-[#162543] sm:text-4xl">{english?"How do you offer your services?":"¿Cómo ofrece sus servicios?"}</h1>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:gap-6">
      {([{role:"professional",Icon:HardHat,title:english?"Independent professional":"Profesional independiente",label:english?"Under your own name":"Con su nombre",mosaic:"ccr-mosaico-pro"},{role:"business",Icon:Store,title:english?"Business or premises":"Empresa o local",label:english?"Add or claim my business":"Agregar o reclamar mi empresa",mosaic:"ccr-mosaico-cliente"}] as const).map(({role,Icon,title,label,mosaic})=><button key={role} type="button" data-welcome-pro-kind-option={role} onClick={()=>onChoose?.(role)} className="ccr-tarjeta-rol group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#009FD9]/35">
        <span className={`ccr-tarjeta-rol-mosaico ${mosaic}`} aria-hidden="true"><Icon className="h-16 w-16 text-[#162543] sm:h-24 sm:w-24" strokeWidth={1.4}/></span>
        <span className="mt-4 block text-center text-[17px] font-bold leading-tight text-[#162543] sm:text-[22px]">{title}</span>
        <span className="mt-1 block text-center text-[13px] font-semibold text-[#009FD9] sm:text-[15px]">{label}</span>
      </button>)}
    </div>
    <p className="mx-auto mt-6 max-w-md text-center text-[13px] leading-relaxed text-[#8a94a6] sm:text-sm">{english?"You can have both with the same account.":"Puede tener las dos cosas con la misma cuenta."}</p>
  </div>;
  return <div className="w-full max-w-2xl">
    <div className="mb-8 text-center">
      <p className="mb-1.5 text-[15px] font-semibold text-[#009FD9]">{english?"Welcome to ContrataCR":"Le damos la bienvenida a ContrataCR"}</p>
      <h1 id={titleId} className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-[#162543] sm:text-4xl">{english?"How do you want to start?":"¿Cómo quiere empezar?"}</h1>
    </div>
    <div className="grid grid-cols-2 gap-3 sm:gap-6">
      {([{role:"professional",Icon:BriefcaseBusiness,title:english?"Offer services":"Ofrezco servicios",label:english?"Professional":"Profesional",mosaic:"ccr-mosaico-pro"},{role:"client",Icon:UserRoundSearch,title:english?"Find services":"Busco servicios",label:english?"Client":"Cliente",mosaic:"ccr-mosaico-cliente"}] as const).map(({role,Icon,title,label,mosaic})=><button key={role} type="button" onClick={()=>{if(role==="professional"&&businessOption&&onChoose)setProStep(true);else onChoose?.(role);}} tabIndex={onChoose?0:-1} className="ccr-tarjeta-rol group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#009FD9]/35">
        <span className={`ccr-tarjeta-rol-mosaico ${mosaic}`} aria-hidden="true"><Icon className="h-16 w-16 text-[#162543] sm:h-24 sm:w-24" strokeWidth={1.4}/></span>
        <span className="mt-4 block text-center text-[17px] font-bold leading-tight text-[#162543] sm:text-[22px]">{title}</span>
        <span className="mt-1 block text-center text-[13px] font-semibold text-[#009FD9] sm:text-[15px]">{label}</span>
      </button>)}
    </div>
    <p className="mx-auto mt-6 max-w-md text-center text-[13px] leading-relaxed text-[#8a94a6] sm:text-sm">{english?"It’s free and takes less than 2 minutes.":"Es gratis y toma menos de 2 minutos."}</p>
    <p className="mt-6 text-center text-sm text-[#6b7280]">{english?"Already have an account?":"¿Ya tiene cuenta?"} <button type="button" onClick={onLogin} tabIndex={onLogin?0:-1} className="min-h-11 font-semibold text-[#009FD9] hover:underline">{english?"Log in":"Inicie sesión"}</button></p>
  </div>;
}
