import { Search, MapPin, ShieldCheck, Star, Send, Headset, CheckCircle2, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Poppins } from "next/font/google";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { MockAvatar } from "@/components/landing/mock-avatar";

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

// A FAITHFUL miniature of the CURRENT /buscar professional card. Mirrors the real
// card 1:1: white rounded-2xl + border; CIRCULAR avatar (EBF5FB / brand-blue initials)
// carrying the navy ranking badge that mirrors its map pin; company name with the
// "Verificado" pill on its OWN line (the canonical Badge variant="verified" = solid
// brand-blue #009FD9 / white); the muted personal name beneath; price right-aligned
// (brand-blue amount + grey unit); grey profession chip; orange-star rating + GREY
// "(N reseñas)" in parens; a Doctoralia-style LOCATION TAB (brand-blue, underlined) on
// a hairline divider + the address line. Then EITHER (pro with published hours) the
// 3-day availability strip + a SINGLE filled "Ver horario completo" button — the
// booking entry point; the old separate "Solicitar servicio" button no longer exists —
// OR (no public schedule) the coral contact note + a filled WhatsApp button.
function ProCard({
  rank, initials, image, company, person, profession, categories, place, address,
  rating, reviews, price, priceUnit, verified,
  schedule, viewSchedule, whatsapp, noScheduleNote,
}: {
  rank: number;
  initials: string; image?: string; company: string; person?: string; profession: string; categories?: string[];
  place: string; address?: string;
  rating: string; reviews: string; price: string; priceUnit?: string; verified: string;
  schedule?: { label: string; times: string[] }[];
  viewSchedule: string; whatsapp: string; noScheduleNote?: string;
}) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3 shadow-[0_1px_3px_rgba(16,24,40,0.05)]">
      {/* Identity — circular avatar (photo, else initials) + navy ranking badge ·
          name / Verificado pill / personal name · price (blue amount + grey unit). */}
      <div className="flex items-start gap-2.5">
        <div className="relative shrink-0">
          <MockAvatar src={image} initials={initials} />
          <span className="absolute -left-1.5 -top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-[#162543] text-[9px] font-bold text-white ring-2 ring-white">{rank}</span>
        </div>
        <div className="min-w-0 flex-1">
          {/* Company + price share the first row, like the real result card. The
              price is compact so "SG Solutions" keeps room in the miniature. */}
          <div className="flex min-w-0 items-start gap-1.5">
            <span className="min-w-0 flex-1 text-[13px] font-bold leading-tight text-[#111827] [overflow-wrap:anywhere]">{company}</span>
            {price ? (
              <span className="shrink-0 whitespace-nowrap pt-px leading-tight text-right">
                {/* A colones amount renders blue + grey unit; a text price renders whole in grey,
                    no unit, mirroring the real /buscar card in a compact phone mockup. */}
                {price.charCodeAt(0) === 0x20a1 ? (
                  <>
                    <span className="text-[10px] font-bold text-[#009FD9]">{price}</span>
                    {priceUnit ? <span className="text-[8px] font-medium text-[#9ca3af]"> {priceUnit}</span> : null}
                  </>
                ) : (
                  <span className="rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[8px] font-semibold text-[#6b7280]">{price}</span>
                )}
              </span>
            ) : null}
          </div>
          {/* "Verificado" on its OWN line below. */}
          <span className="mt-1 inline-flex w-fit items-center rounded-full bg-[#009FD9] px-1.5 py-0.5 text-[8px] font-semibold leading-none text-white">{verified}</span>
          {person ? <p className="mt-0.5 truncate text-[10px] font-medium leading-tight text-[#6b7280]">{person}</p> : null}
          {/* Profession chip + reviews sit DIRECTLY under the name (mirrors the real
              /buscar card: company → personal name → profession → reviews, all grouped
              in the column beside the avatar — Sprint 175). */}
          {/* A card with service categories shows THEM as the chips (same grey chip
              style) instead of a single profession chip; otherwise the profession chip. */}
          {categories && categories.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {categories.map((c) => (
                <span key={c} className="inline-block w-fit rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[9px] font-medium text-[#6b7280]">{c}</span>
              ))}
            </div>
          ) : (
            <span className="mt-1.5 inline-block w-fit rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[9px] font-medium text-[#6b7280]">{profession}</span>
          )}
          <div className="mt-1 flex items-center gap-1 text-[10px]">
            <Star className="h-2.5 w-2.5 fill-[#ff9b32] text-[#ff9b32]" />
            <span className="font-bold text-[#111827]">{rating}</span>
            <span className="font-medium text-[#9ca3af]">({reviews})</span>
          </div>
        </div>
      </div>

      {/* Location TAB (brand-blue, underlined) on a hairline divider + address line. */}
      <div className="mt-1.5 flex items-center border-b border-[#e5e7eb]">
        <span className="-mb-px inline-flex items-center gap-1 border-b-2 border-[#009FD9] pb-1.5 text-[10px] font-semibold text-[#009FD9]">
          <MapPin className="h-2.5 w-2.5" /> {place}
        </span>
      </div>
      {address ? <p className="mt-1 truncate text-[9px] leading-snug text-[#6b7280]">{address}</p> : null}

      {schedule ? (
        <>
          {/* 3-day availability strip — the hero feature. */}
          <div className="mt-2.5 flex items-start gap-1">
            <ChevronLeft className="mt-3 h-3 w-3 shrink-0 text-[#d1d5db]" />
            <div className="grid flex-1 grid-cols-3 gap-1.5">
              {schedule.map((d) => (
                <div key={d.label} className="min-w-0">
                  <p className="truncate text-center text-[9px] font-semibold leading-tight text-[#6b7280]">{d.label}</p>
                  {d.times.map((tt) => (
                    <span key={tt} className="mt-1 block rounded-md bg-[#EBF5FB] py-1 text-center text-[9px] font-semibold leading-none text-[#0089bb]">{tt}</span>
                  ))}
                </div>
              ))}
            </div>
            <ChevronRight className="mt-3 h-3 w-3 shrink-0 text-[#9ca3af]" />
          </div>
          {/* SINGLE filled primary button (the booking entry point). */}
          <button className="mt-2.5 w-full rounded-full bg-[#009FD9] py-2 text-[10px] font-semibold text-white">{viewSchedule}</button>
        </>
      ) : (
        <>
          {/* No public schedule → coral contact note + filled WhatsApp button. */}
          {noScheduleNote ? (
            <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-[#F7D8D1] bg-[#FDF3F1] px-2 py-1.5">
              <CalendarDays className="mt-px h-3 w-3 shrink-0 text-[#DC5B4B]" />
              <p className="line-clamp-2 text-[9px] leading-snug text-[#DC5B4B]">{noScheduleNote}</p>
            </div>
          ) : null}
          <button className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-[#25D366] py-2 text-[10px] font-bold text-white"><WhatsAppIcon className="h-3 w-3" /> {whatsapp}</button>
        </>
      )}
    </div>
  );
}

export type ResultsCopy = {
  title: string; categories: string[]; results: string; search: string; verified: string;
  whatsapp: string; viewSchedule: string; noScheduleNote: string; priceUnit: string; priceOnRequest: string;
  reviews: (n: number) => string;
  days: { label: string; times: string[] }[];
};

// Spanish defaults so the dead SHOWCASE_SCREENS reference still renders; the live
// "Así funciona" section passes locale-aware copy from why-contratacr.tsx.
const DEFAULT_RESULTS_COPY: ResultsCopy = {
  title: "Tecnología",
  categories: ["Reparación de computadoras", "Redes e internet", "Cámaras de seguridad"],
  results: "128 servicios en Costa Rica",
  search: "Tecnología en San José",
  verified: "Verificado",
  whatsapp: "Contáctanos por WhatsApp",
  viewSchedule: "Ver horario completo",
  noScheduleNote: "La disponibilidad de este perfil no es pública. Contáctanos y conoce sus horarios.",
  priceUnit: "/hora",
  priceOnRequest: "Consultar",
  reviews: (n) => `${n} reseñas`,
  days: [
    { label: "Hoy", times: ["9:00", "14:00"] },
    { label: "Mañana", times: ["8:30", "15:00"] },
    { label: "Jue 18", times: ["10:00"] },
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
      {/* Real-style result cards — one WITH a published schedule (the booking hero),
          one WITHOUT (the WhatsApp contact path), mirroring the real mixed /buscar list. */}
      <div className="flex-1 space-y-2 overflow-hidden p-3">
        <ProCard
          rank={1} initials="SG" image="https://res.cloudinary.com/dxxrjx2go/image/upload/f_auto,q_auto/v1781846892/sgimage_psyvpn_hyyp4c.jpg" company="SG Solutions" person="Luis Sánchez" profession={copy.title} categories={copy.categories}
          place="San José" address="Escazú, San José" rating="4.9" reviews={copy.reviews(48)}
          price={copy.priceOnRequest} verified={copy.verified} schedule={copy.days}
          viewSchedule={copy.viewSchedule} whatsapp={copy.whatsapp}
        />
        <ProCard
          rank={2} initials="AM" image="https://randomuser.me/api/portraits/women/68.jpg" company="Ana Mora" profession={copy.title}
          place="Heredia" address="Heredia centro" rating="4.8" reviews={copy.reviews(31)}
          price={copy.priceOnRequest} verified={copy.verified}
          viewSchedule={copy.viewSchedule} whatsapp={copy.whatsapp} noScheduleNote={copy.noScheduleNote}
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
        <div className="ml-auto max-w-[82%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-[11px] text-[#1a2744] shadow-sm">¡Claro! Llego hoy a las 3:00PM. El diagnóstico es gratis. 👍</div>
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
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-[#EBF5FB] text-[#009FD9]"><Headset className="h-4 w-4" /></span>
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
          <span className="text-[11px] font-bold text-white">Sin comisiones por los servicios</span>
        </div>
      </div>
    </div>
  );
}

export const SHOWCASE_SCREENS = [SearchScreen, ResultsScreen, ChatScreen, SupportScreen, ProScreen];
