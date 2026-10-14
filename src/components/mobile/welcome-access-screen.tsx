"use client";

import { useEffect } from "react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { WelcomeChoiceContent, type WelcomeRole } from "./welcome-choice-content";
export type { WelcomeRole } from "./welcome-choice-content";

export function WelcomeAccessScreen({className,english,onCreateAccount,onLogin,onNavigate,onHeroReady,titleId,testId}:{className:string;english:boolean;onCreateAccount:(role:WelcomeRole)=>void;onLogin:()=>void;onNavigate:(href:string)=>void;onHeroReady?:()=>void;titleId:string;testId?:string}) {
  useEffect(()=>{onHeroReady?.();},[onHeroReady]);
  return <div className={`${className} overflow-y-auto bg-white text-[#162543]`} data-testid={testId} data-native-onboarding-ready="true">
    <div className="flex min-h-dvh flex-col">
      <LandingNavbar mobileSearch={false} onWelcomeNavigate={onNavigate}/>
      <div className="h-16 shrink-0" aria-hidden/>
      <main className="ccr-welcome-choice-main"><WelcomeChoiceContent english={english} onChoose={onCreateAccount} onLogin={onLogin} titleId={titleId}/></main>
    </div>
  </div>;
}
