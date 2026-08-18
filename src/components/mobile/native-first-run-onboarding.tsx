"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PushNotifications } from "@capacitor/push-notifications";
import {
  BellRing,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageCircleMore,
  Search,
  ShieldCheck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useNativeApp } from "@/hooks/use-native-app";
import { cn } from "@/lib/utils";

const COMPLETED_KEY = "ccr:native-first-run-onboarding:v3";
type Step = "role" | "notifications";
type Role = "client" | "professional";

export function NativeFirstRunOnboarding() {
  const nativeApp = useNativeApp();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<Role | null>(null);
  const [requesting, setRequesting] = useState(false);
  const english = pathname?.startsWith("/en") ?? false;

  useEffect(() => {
    if (!nativeApp || window.localStorage.getItem(COMPLETED_KEY) === "1") return;
    const timer = window.setTimeout(() => setVisible(true), 80);
    return () => window.clearTimeout(timer);
  }, [nativeApp]);

  useEffect(() => {
    if (!visible) return;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [visible]);

  const complete = useCallback(() => {
    window.localStorage.setItem(COMPLETED_KEY, "1");
    setVisible(false);
  }, []);

  const destinationFor = useCallback((selectedRole: Role | null) => {
    if (!selectedRole) return null;
    if (selectedRole === "client") return user ? "/buscar" : "/registro/cliente";
    return user?.user_metadata?.is_provider === true ? "/dashboard/profesional" : "/registro/profesional";
  }, [user]);

  const finish = useCallback(() => {
    const destination = destinationFor(role);
    complete();
    if (destination) router.push(destination);
  }, [complete, destinationFor, role, router]);

  const chooseRole = useCallback((selectedRole: Role) => {
    setRole(selectedRole);
    setStep("notifications");
  }, []);

  const requestNotifications = useCallback(async () => {
    setRequesting(true);
    try {
      await PushNotifications.requestPermissions();
    } catch (error) {
      console.error("[native-onboarding] notification permission failed", error);
    } finally {
      setRequesting(false);
      finish();
    }
  }, [finish]);

  const goToLogin = useCallback(() => {
    complete();
    router.push("/login");
  }, [complete, router]);

  if (!visible || !nativeApp) return null;

  return createPortal(
    <div className="fixed inset-0 z-[220] overflow-hidden bg-white text-[#162543]" data-testid="native-first-run-onboarding" role="dialog" aria-modal="true" aria-labelledby="native-onboarding-title">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[46%] overflow-hidden bg-[linear-gradient(155deg,#eaf8fd_0%,#f7fbff_58%,#ffffff_100%)]">
        <span className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#009FD9]/10" />
        <span className="absolute -left-24 top-36 h-56 w-56 rounded-full border-[34px] border-[#162543]/[0.035]" />
        <span className="absolute right-8 top-36 h-2 w-2 rounded-full bg-[#009FD9]/45" />
        <span className="absolute right-20 top-24 h-3 w-3 rounded-full bg-[#162543]/10" />
      </div>

      <main className="relative mx-auto flex h-[100dvh] w-full max-w-lg flex-col px-6 pb-[max(22px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))]">
        <header className="flex min-h-12 items-center justify-between">
          {step === "notifications" ? (
            <button type="button" onClick={() => setStep("role")} className="grid h-11 w-11 place-items-center rounded-full text-[#52627a]" aria-label={english ? "Back" : "Volver"}><ChevronLeft className="h-6 w-6" /></button>
          ) : <span className="h-11 w-11" />}
          <div className="flex items-center gap-2" aria-label="ContrataCR">
            <img src="/logo-mark-transparent.png" alt="" className="h-8 w-8 object-contain" />
            <span className="text-xl font-black tracking-[-0.04em]">Contrata<span className="text-[#009FD9]">CR</span></span>
          </div>
          <button type="button" onClick={complete} className="h-11 min-w-11 px-1 text-sm font-bold text-[#64748b]">{english ? "Skip" : "Omitir"}</button>
        </header>

        <div className="mt-3 flex justify-center gap-2" aria-label={english ? "Step progress" : "Progreso"}>
          <span className="h-1.5 w-8 rounded-full bg-[#009FD9]" />
          <span className={cn("h-1.5 w-8 rounded-full transition-colors", step === "notifications" ? "bg-[#009FD9]" : "bg-[#cfdae4]")} />
        </div>

        {step === "role" ? (
          <section className="flex min-h-0 flex-1 flex-col" data-testid="native-onboarding-role-step">
            <div className="mx-auto mt-[clamp(1.8rem,7vh,4.5rem)] grid h-24 w-24 place-items-center rounded-[32px] bg-white shadow-[0_22px_55px_-24px_rgba(0,159,217,0.7)] ring-1 ring-[#009FD9]/10"><Sparkles className="h-11 w-11 text-[#009FD9]" strokeWidth={1.8} /></div>
            <h1 id="native-onboarding-title" className="mt-7 text-center text-[clamp(1.85rem,8vw,2.35rem)] font-black leading-[1.08] tracking-[-0.045em]">{english ? "What brings you to ContrataCR?" : "¿Qué quieres lograr hoy?"}</h1>
            <p className="mx-auto mt-3 max-w-sm text-center text-[15px] font-medium leading-6 text-[#627187]">{english ? "Choose how you'd like to start. You can use both options anytime." : "Elige cómo quieres empezar. Después podrás usar ambas opciones cuando quieras."}</p>
            <div className="mt-7 grid gap-3">
              <RoleCard icon={Search} title={english ? "I'm looking for a service" : "Busco un servicio"} description={english ? "Discover trusted professionals near you" : "Encuentra profesionales de confianza cerca de ti"} onClick={() => chooseRole("client")} tone="primary" />
              <RoleCard icon={BriefcaseBusiness} title={english ? "I offer my services" : "Ofrezco mis servicios"} description={english ? "Showcase your work and receive opportunities" : "Muestra tu trabajo y recibe oportunidades"} onClick={() => chooseRole("professional")} tone="dark" />
            </div>
            <button type="button" onClick={goToLogin} className="mt-auto min-h-12 pt-5 text-center text-sm font-semibold text-[#52627a]">{english ? "Already have an account? " : "¿Ya tienes una cuenta? "}<span className="font-extrabold text-[#009FD9] underline decoration-[#009FD9]/30 underline-offset-4">{english ? "Log in" : "Inicia sesión"}</span></button>
          </section>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col" data-testid="native-onboarding-notifications-step">
            <div className="relative mx-auto mt-[clamp(2rem,8vh,5rem)] h-52 w-full max-w-[330px]">
              <div className="absolute left-1/2 top-4 grid h-28 w-28 -translate-x-1/2 place-items-center rounded-[38px] bg-[#009FD9] text-white shadow-[0_25px_55px_-22px_rgba(0,159,217,0.95)]"><BellRing className="h-12 w-12" strokeWidth={1.8} /></div>
              <div className="absolute inset-x-1 top-28 rounded-2xl border border-[#d9e7f0] bg-white/95 p-3 shadow-[0_18px_45px_-26px_rgba(15,29,53,0.55)] backdrop-blur">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf8fd] text-[#009FD9]"><MessageCircleMore className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="text-sm font-extrabold">ContrataCR</p><p className="truncate text-xs font-medium text-[#64748b]">{english ? "You received a new message" : "Recibiste un nuevo mensaje"}</p></div><span className="text-[10px] font-bold text-[#94a3b8]">{english ? "now" : "ahora"}</span></div>
              </div>
            </div>
            <h1 id="native-onboarding-title" className="text-center text-[clamp(1.85rem,8vw,2.35rem)] font-black leading-[1.08] tracking-[-0.045em]">{english ? "Stay close to every opportunity" : "Tus oportunidades, siempre cerca"}</h1>
            <p className="mx-auto mt-3 max-w-sm text-center text-[15px] font-medium leading-6 text-[#627187]">{english ? "Get timely messages, requests and important updates. No intrusive advertising." : "Recibe mensajes, solicitudes y novedades importantes a tiempo. Sin publicidad invasiva."}</p>
            <div className="mx-auto mt-5 flex items-center gap-2 rounded-full bg-[#f1f8fc] px-4 py-2 text-xs font-bold text-[#466179]"><ShieldCheck className="h-4 w-4 text-[#009FD9]" />{english ? "You stay in control" : "Tú mantienes el control"}<Check className="h-4 w-4 text-[#16a34a]" /></div>
            <div className="mt-auto space-y-2 pt-6">
              <button type="button" onClick={requestNotifications} disabled={requesting} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#009FD9] px-5 text-base font-extrabold text-white shadow-[0_15px_35px_-15px_rgba(0,159,217,0.9)] transition active:scale-[0.99] disabled:cursor-wait disabled:opacity-70">{requesting ? (english ? "Activating..." : "Activando...") : (english ? "Enable notifications" : "Activar notificaciones")}{!requesting && <ChevronRight className="h-5 w-5" />}</button>
              <button type="button" onClick={finish} className="min-h-12 w-full text-sm font-bold text-[#64748b]">{english ? "Maybe later" : "Quizás después"}</button>
            </div>
          </section>
        )}
      </main>
    </div>,
    document.body,
  );
}

function RoleCard({ icon: Icon, title, description, onClick, tone }: { icon: LucideIcon; title: string; description: string; onClick: () => void; tone: "primary" | "dark" }) {
  return (
    <button type="button" onClick={onClick} className="group flex min-h-[92px] w-full items-center gap-4 rounded-[22px] border border-[#dce7ef] bg-white p-4 text-left shadow-[0_12px_35px_-26px_rgba(15,29,53,0.7)] transition active:scale-[0.99]">
      <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-[18px] text-white", tone === "primary" ? "bg-[#009FD9]" : "bg-[#162543]")}><Icon className="h-6 w-6" /></span>
      <span className="min-w-0 flex-1"><strong className="block text-base font-extrabold leading-5 text-[#162543]">{title}</strong><span className="mt-1 block text-xs font-medium leading-[1.15rem] text-[#68778d]">{description}</span></span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[#009FD9] transition-transform group-active:translate-x-0.5" />
    </button>
  );
}
