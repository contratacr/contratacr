import { Search, MapPin, ShieldCheck, Star, Send, LifeBuoy, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { Poppins } from "next/font/google";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

// New brand wordmark font (matches the official ContrataCR logo).
const poppins = Poppins({ subsets: ["latin"], weight: ["700", "800"], display: "swap" });

/* Reusable phone frame + the real-app screens shown in the sticky showcase
   ("Por qué elegir ContrataCR"). Each screen mirrors the actual ContrataCR UI.
   These are easy to later swap for short screen-recording videos. */

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  // Modern flagship device: refined titanium rail, slim black bezel, crisp
  // squircle screen, dynamic island, machined side buttons, layered depth
  // shadows and a faint top glass sheen for a premium, current look.
  return (
    <div className="relative mx-auto" style={{ width: 284 }}>
      {/* side buttons (machined titanium) */}
      <div aria-hidden className="absolute -left-[2px] top-[116px] h-8 w-[3px] rounded-l-sm bg-[#2b2f36]" />
      <div aria-hidden className="absolute -left-[2px] top-[162px] h-12 w-[3px] rounded-l-sm bg-[#2b2f36]" />
      <div aria-hidden className="absolute -left-[2px] top-[208px] h-12 w-[3px] rounded-l-sm bg-[#2b2f36]" />
      <div aria-hidden className="absolute -right-[2px] top-[150px] h-16 w-[3px] rounded-r-sm bg-[#2b2f36]" />

      {/* outer titanium rail */}
      <div
        className="relative"
        style={{
          background: "linear-gradient(135deg,#f1f3f6 0%,#c6cbd2 18%,#777c85 50%,#c6cbd2 82%,#f1f3f6 100%)",
          borderRadius: 56,
          padding: 3,
          boxShadow:
            "0 50px 100px -28px rgba(15,23,42,0.50), 0 24px 48px -22px rgba(15,23,42,0.42), inset 0 0 0 0.5px rgba(255,255,255,0.45)",
        }}
      >
        {/* black bezel */}
        <div className="relative" style={{ background: "#04060a", borderRadius: 53, padding: 8 }}>
          {/* screen */}
          <div className="relative overflow-hidden bg-white" style={{ borderRadius: 46, height: 582 }}>
            {/* dynamic island */}
            <div className="absolute z-30" style={{ top: 11, left: "50%", transform: "translateX(-50%)", width: 90, height: 26, background: "#000", borderRadius: 14 }} />
            {/* status bar */}
            <div className="relative z-20 flex items-center justify-between px-6 pt-3.5 pb-1">
              <span className="text-[11px] font-semibold text-[#1a2744]">9:41</span>
              <span className="flex items-center gap-1">
                <span className="flex items-end gap-[1.5px] h-2.5">
                  <span className="w-[2px] h-1 rounded-sm bg-[#1a2744]" /><span className="w-[2px] h-1.5 rounded-sm bg-[#1a2744]" /><span className="w-[2px] h-2 rounded-sm bg-[#1a2744]" /><span className="w-[2px] h-2.5 rounded-sm bg-[#1a2744]" />
                </span>
                <span className="inline-block h-2.5 w-5 rounded-[3px] border border-[#1a2744] relative"><span className="absolute inset-[1.5px] right-1 rounded-[1px] bg-[#1a2744]" /></span>
              </span>
            </div>
            <div className="h-[calc(582px-30px)]">{children}</div>
            {/* faint top glass sheen — premium, non-intrusive (top ~14% only) */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 z-40 h-20"
              style={{ background: "linear-gradient(180deg,rgba(255,255,255,0.14) 0%,rgba(255,255,255,0) 100%)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function AppBar({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between bg-white px-4 pt-1 pb-3 border-b border-[#eef1f5]">
      {/* New ContrataCR logo: CR mark + wordmark (Poppins, brand blue #008ce0) */}
      <span className="flex items-center gap-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-mark.png" srcSet="/logo-mark.png 1x, /logo-mark@2x.png 2x" alt="ContrataCR" width={16} height={16} className="h-4 w-4" />
        <span className={`${poppins.className} text-[12px] font-extrabold tracking-tight leading-none`}>
          <span className="text-[#1a2744]">Contrata</span><span style={{ color: "#008ce0" }}>CR</span>
        </span>
      </span>
      <span className="text-[10px] font-medium text-[#9ca3af]">{title}</span>
    </div>
  );
}

export function SearchScreen() {
  return (
    <div className="flex h-full flex-col bg-[#f4f7fa]">
      <AppBar title="Buscar" />
      <div className="p-3.5">
        <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 shadow-sm">
          <Search className="h-4 w-4 text-[#9ca3af]" />
          <span className="text-[12px] text-[#374151]">Necesito un plomero…</span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5">
          <MapPin className="h-4 w-4 text-[#9ca3af]" />
          <span className="text-[12px] text-[#6b7280]">San José</span>
        </div>
        <p className="mt-4 text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">Servicios populares</p>
        <div className="mt-2 space-y-1.5">
          {["Limpieza del hogar", "Plomería y tuberías", "Pintura interior", "Jardinería y poda", "Mudanzas"].map((s) => (
            <div key={s} className="flex items-center gap-2.5 rounded-lg bg-white px-3 py-2.5 border border-[#f1f3f5]">
              <Search className="h-3.5 w-3.5 text-[#9ca3af]" />
              <span className="text-[12px] text-[#374151]">{s}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// A FAITHFUL miniature of the real /buscar professional card: white rounded-2xl
// with border, avatar (EBF5FB / brand-blue initials), the SAME solid brand-blue
// "Verificado" pill (Badge variant="verified" = bg #009FD9 / white), price on the
// right, grey profession chip, orange-star rating + brand-blue reviews link,
// brand-blue location pin, an inline availability schedule (the hero feature), and
// the WhatsApp (green) + "Solicitar servicio" (brand-blue) action row.
function ProCard({
  initials, company, person, profession, place, rating, reviews, price, verified,
  schedule, request, whatsapp, viewSchedule,
}: {
  initials: string; company: string; person?: string; profession: string; place: string;
  rating: string; reviews: string; price: string; verified: string;
  schedule?: { label: string; times: string[] }[];
  request: string; whatsapp: string; viewSchedule: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      <div className="flex gap-2.5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#EBF5FB] text-[12px] font-extrabold text-[#009FD9]">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-[13px] font-bold leading-tight text-[#111827]">{company}</span>
            <span className="shrink-0 rounded-full bg-[#009FD9] px-1.5 py-0.5 text-[8px] font-semibold leading-none text-white">{verified}</span>
            <span className="ml-auto shrink-0 whitespace-nowrap text-[12px] font-bold text-[#111827]">{price}</span>
          </div>
          {person ? <p className="truncate text-[10px] font-medium leading-tight text-[#6b7280]">{person}</p> : null}
          <span className="mt-1 inline-block rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[9px] font-medium text-[#6b7280]">{profession}</span>
          <div className="mt-1 flex items-center gap-1 text-[10px]">
            <Star className="h-2.5 w-2.5 fill-[#ff9b32] text-[#ff9b32]" />
            <span className="font-bold text-[#111827]">{rating}</span>
            <span className="text-[#9ca3af]">·</span>
            <span className="font-medium text-[#009FD9]">{reviews}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-[#6b7280]">
            <MapPin className="h-2.5 w-2.5 shrink-0 text-[#009FD9]" /><span className="truncate">{place}</span>
          </div>
        </div>
      </div>

      {schedule ? (
        <div className="mt-2.5 border-t border-[#f3f4f6] pt-2">
          <div className="flex items-start gap-1">
            <ChevronLeft className="mt-3 h-3 w-3 shrink-0 text-[#d1d5db]" />
            <div className="grid flex-1 grid-cols-3 gap-1">
              {schedule.map((d) => (
                <div key={d.label} className="min-w-0">
                  <p className="truncate text-center text-[8px] font-bold uppercase leading-tight tracking-wide text-[#009FD9]">{d.label}</p>
                  {d.times.map((tt) => (
                    <span key={tt} className="mt-1 block rounded-md bg-[#EBF5FB] py-0.5 text-center text-[9px] font-semibold leading-none text-[#0089bb]">{tt}</span>
                  ))}
                </div>
              ))}
            </div>
            <ChevronRight className="mt-3 h-3 w-3 shrink-0 text-[#9ca3af]" />
          </div>
          <p className="mt-1.5 text-center text-[8px] font-medium text-[#009FD9]">{viewSchedule}</p>
        </div>
      ) : null}

      <div className="mt-2.5 flex items-center gap-1.5">
        <span className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-[#25D366] py-1.5 text-[10px] font-bold text-white"><WhatsAppIcon className="h-3 w-3" /> {whatsapp}</span>
        <span className="flex-1 rounded-lg bg-[#009FD9] py-1.5 text-center text-[10px] font-bold text-white">{request}</span>
      </div>
    </div>
  );
}

export type ResultsCopy = {
  title: string; results: string; search: string; verified: string;
  request: string; whatsapp: string; viewSchedule: string;
  reviews: (n: number) => string;
  days: { label: string; times: string[] }[];
};

// Spanish defaults so the dead SHOWCASE_SCREENS reference still renders; the live
// "Así funciona" section passes locale-aware copy from why-contratacr.tsx.
const DEFAULT_RESULTS_COPY: ResultsCopy = {
  title: "Plomería",
  results: "128 profesionales en Costa Rica",
  search: "Plomería en San José",
  verified: "Verificado",
  request: "Solicitar servicio",
  whatsapp: "WhatsApp",
  viewSchedule: "Ver horario completo",
  reviews: (n) => `${n} reseñas`,
  days: [
    { label: "HOY", times: ["9:00", "14:00"] },
    { label: "MAÑ", times: ["8:30", "15:00"] },
    { label: "+2", times: ["10:00"] },
  ],
};

export function ResultsScreen({ copy = DEFAULT_RESULTS_COPY }: { copy?: ResultsCopy }) {
  return (
    <div className="flex h-full flex-col bg-[#f4f7fa]">
      <AppBar title={copy.title} />
      {/* Search context — mirrors the real /buscar top bar (search field + count). */}
      <div className="border-b border-[#eef1f5] bg-white px-3.5 pb-2.5 pt-2">
        <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-[#9ca3af]" />
          <span className="truncate text-[11px] text-[#374151]">{copy.search}</span>
        </div>
        <p className="mt-1.5 text-[10px] text-[#6b7280]">{copy.results}</p>
      </div>
      {/* Real-style result cards */}
      <div className="flex-1 space-y-2 overflow-hidden p-3">
        <ProCard
          initials="SG" company="SG Solutions" person="Steven Gómez" profession={copy.title}
          place="San José, Escazú" rating="4.9" reviews={copy.reviews(48)} price="₡12 000/h"
          verified={copy.verified} schedule={copy.days}
          request={copy.request} whatsapp={copy.whatsapp} viewSchedule={copy.viewSchedule}
        />
        <ProCard
          initials="AM" company="Ana Mora" profession={copy.title}
          place="Heredia" rating="4.8" reviews={copy.reviews(31)} price="₡10 000/h"
          verified={copy.verified}
          request={copy.request} whatsapp={copy.whatsapp} viewSchedule={copy.viewSchedule}
        />
      </div>
    </div>
  );
}

export function ChatScreen() {
  return (
    <div className="flex h-full flex-col bg-[#ece5dd]">
      <div className="flex items-center gap-2.5 bg-white px-4 py-2.5 border-b border-[#eef1f5]">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[#EBF5FB] text-[11px] font-bold text-[#009FD9]">CR</div>
        <div className="min-w-0">
          <div className="flex items-center gap-1"><span className="text-[12px] font-bold text-[#111827]">Carlos Ramírez</span><ShieldCheck className="h-3 w-3 text-[#16a34a]" /></div>
          <span className="text-[10px] text-[#16a34a]">en línea</span>
        </div>
      </div>
      <div className="flex-1 space-y-2 p-3">
        <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[11px] text-[#374151] shadow-sm">Hola, tengo una fuga bajo el lavamanos. ¿Podría ir hoy?</div>
        <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-[11px] text-[#1a2744] shadow-sm">¡Claro! Llego hoy a las 3:00 p. m. El diagnóstico es gratis. 👍</div>
        <div className="max-w-[82%] rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[11px] text-[#374151] shadow-sm">Perfecto, ahí lo espero. ¡Gracias!</div>
      </div>
      <div className="flex items-center gap-2 bg-white px-3 py-2.5">
        <span className="flex-1 rounded-full bg-[#f3f4f6] px-3 py-1.5 text-[11px] text-[#9ca3af]">Mensaje…</span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#25D366] text-white"><Send className="h-3.5 w-3.5" /></span>
      </div>
    </div>
  );
}

export function SupportScreen() {
  return (
    <div className="flex h-full flex-col bg-[#f4f7fa]">
      <AppBar title="Mi solicitud" />
      <div className="p-3.5 space-y-3">
        <div className="rounded-xl border border-[#dcfce7] bg-[#f0fdf4] p-3.5 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-[#16a34a]" />
          <p className="mt-2 text-[13px] font-bold text-[#111827]">Servicio completado</p>
          <p className="text-[11px] text-[#6b7280]">Carlos Ramírez · Plomería</p>
        </div>
        <div className="rounded-xl border border-[#eef1f5] bg-white p-3">
          <p className="text-[11px] font-bold text-[#111827]">¿Cómo te fue?</p>
          <div className="mt-1.5 flex gap-1">{[1,2,3,4,5].map((s) => <Star key={s} className="h-5 w-5 fill-[#ff9b32] text-[#ff9b32]" />)}</div>
          <p className="mt-1 text-[10px] text-[#9ca3af]">Tu reseña ayuda a otros clientes.</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white p-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#EBF5FB] text-[#009FD9]"><LifeBuoy className="h-4 w-4" /></span>
          <div><p className="text-[11px] font-bold text-[#111827]">Soporte ContrataCR</p><p className="text-[10px] text-[#6b7280]">¿Algo no salió bien? Estamos para ayudarte.</p></div>
        </div>
      </div>
    </div>
  );
}

export function ProScreen() {
  const reqs = [
    { n: "María V.", s: "Plomería · fuga en cocina", z: "San José" },
    { n: "Jorge S.", s: "Instalación de grifo", z: "Escazú" },
  ];
  return (
    <div className="flex h-full flex-col bg-[#f4f7fa]">
      <AppBar title="Mi panel" />
      <div className="p-3.5 space-y-3">
        <div className="flex items-center gap-2 rounded-xl border border-[#dcfce7] bg-[#f0fdf4] px-3 py-2.5">
          <ShieldCheck className="h-4 w-4 text-[#16a34a]" />
          <span className="text-[11px] font-semibold text-[#166534]">Perfil verificado · apareces primero</span>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">Nuevas solicitudes</p>
        {reqs.map((r) => (
          <div key={r.n} className="rounded-xl border border-[#eef1f5] bg-white p-2.5">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#EBF5FB] text-[10px] font-bold text-[#009FD9]">{r.n[0]}</div>
              <div className="min-w-0 flex-1"><span className="text-[12px] font-bold text-[#111827]">{r.n}</span><p className="text-[10px] text-[#6b7280] truncate">{r.s}</p></div>
              <span className="text-[9px] text-[#9ca3af]">{r.z}</span>
            </div>
            <div className="mt-2 flex gap-1.5">
              <span className="flex-1 rounded-md bg-[#009FD9] py-1 text-center text-[9px] font-bold text-white">Ver solicitud</span>
              <span className="grid h-5 w-5 place-items-center rounded-md border border-[#bbf7d0] text-[#16a34a]"><WhatsAppIcon className="h-2.5 w-2.5" /></span>
            </div>
          </div>
        ))}
        <div className="rounded-xl bg-[#1a2744] px-3 py-2.5 text-center">
          <span className="text-[11px] font-bold text-white">100% gratis · sin comisiones</span>
        </div>
      </div>
    </div>
  );
}

export const SHOWCASE_SCREENS = [SearchScreen, ResultsScreen, ChatScreen, SupportScreen, ProScreen];
