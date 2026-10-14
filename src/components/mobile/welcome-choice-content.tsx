"use client";

import { BriefcaseBusiness, UserRoundSearch } from "lucide-react";

export type WelcomeRole = "client" | "professional";

// Also rendered before hydration: first paint and interactive welcome match.
export function WelcomeChoiceContent({english=false,compactPreview=false,onChoose,onLogin,titleId}:{english?:boolean;compactPreview?:boolean;onChoose?:(role:WelcomeRole)=>void;onLogin?:()=>void;titleId?:string}) {
  return <div className="w-full max-w-2xl">
    <div className="mb-8 text-center">
      <p className="mb-1.5 text-[15px] font-semibold text-[#009FD9]">{english?"Welcome to ContrataCR":"Te damos la bienvenida a ContrataCR"}</p>
      <h1 id={titleId} className={`text-[1.75rem] font-extrabold leading-tight tracking-tight text-[#162543] ${compactPreview ? "" : "sm:text-4xl"}`}>{english?"How do you want to start?":"¿Cómo quieres empezar?"}</h1>
    </div>
    <div className={`grid grid-cols-2 gap-3 ${compactPreview ? "" : "sm:gap-6"}`}>
      {([{role:"professional",Icon:BriefcaseBusiness,title:english?"Offer services":"Ofrezco servicios",label:english?"Professional":"Profesional",mosaic:"ccr-mosaico-pro"},{role:"client",Icon:UserRoundSearch,title:english?"Find services":"Busco servicios",label:english?"Client":"Cliente",mosaic:"ccr-mosaico-cliente"}] as const).map(({role,Icon,title,label,mosaic})=><button key={role} type="button" onClick={()=>onChoose?.(role)} tabIndex={onChoose?0:-1} className="ccr-tarjeta-rol group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#009FD9]/35">
        <span className={`ccr-tarjeta-rol-mosaico ${mosaic}`} aria-hidden="true"><Icon className={`h-16 w-16 text-[#162543] ${compactPreview ? "" : "sm:h-24 sm:w-24"}`} strokeWidth={1.4}/></span>
        <span className={`mt-4 block text-center text-[17px] font-bold leading-tight text-[#162543] ${compactPreview ? "" : "sm:text-[22px]"}`}>{title}</span>
        <span className={`mt-1 block text-center text-[13px] font-semibold text-[#009FD9] ${compactPreview ? "" : "sm:text-[15px]"}`}>{label}</span>
      </button>)}
    </div>
    <p className={`mx-auto mt-6 max-w-md text-center text-[13px] leading-relaxed text-[#8a94a6] ${compactPreview ? "" : "sm:text-sm"}`}>{english?"It’s free and takes less than 2 minutes.":"Es gratis y toma menos de 2 minutos."}</p>
    <p className="mt-6 text-center text-sm text-[#6b7280]">{english?"Already have an account?":"¿Ya tienes cuenta?"} <button type="button" onClick={onLogin} tabIndex={onLogin?0:-1} className="min-h-11 font-semibold text-[#009FD9] hover:underline">{english?"Log in":"Inicia sesión"}</button></p>
  </div>;
}
