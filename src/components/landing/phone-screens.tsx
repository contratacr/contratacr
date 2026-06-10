import { Search, MapPin, ShieldCheck, Star, Send, LifeBuoy, CheckCircle2 } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

/* Reusable phone frame + the real-app screens shown in the sticky showcase
   ("Por qué elegir ContrataCR"). Each screen mirrors the actual ContrataCR UI.
   These are easy to later swap for short screen-recording videos. */

export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto" style={{ width: 280 }}>
      <div
        className="relative"
        style={{
          background: "linear-gradient(145deg,#111827,#0b1220)",
          borderRadius: 46,
          padding: 11,
          boxShadow: "0 50px 100px -20px rgba(15,23,42,0.55), 0 0 0 1px rgba(255,255,255,0.05) inset",
        }}
      >
        <div className="absolute z-20" style={{ top: 15, left: "50%", transform: "translateX(-50%)", width: 90, height: 25, background: "#000", borderRadius: 13 }} />
        <div className="relative overflow-hidden bg-white" style={{ borderRadius: 36, height: 564 }}>
          <div className="flex items-center justify-between bg-white px-5 pt-3.5 pb-1">
            <span className="text-[10px] font-semibold text-[#1a2744]">9:41</span>
            <span className="inline-block h-2 w-4 rounded-sm border border-[#1a2744]"><span className="m-px block h-1 w-2.5 rounded-[1px] bg-[#1a2744]" /></span>
          </div>
          <div className="h-[calc(564px-26px)]">{children}</div>
        </div>
      </div>
    </div>
  );
}

function AppBar({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between bg-white px-4 pt-1 pb-3 border-b border-[#eef1f5]">
      <span className="text-[12px] font-extrabold tracking-tight text-[#1a2744]">Contrata<span className="text-[#009FD9]">CR</span></span>
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

function MiniCard({ initials, name, profession, place, rating, reviews, price }: { initials: string; name: string; profession: string; place: string; rating: string; reviews: number; price: string }) {
  return (
    <div className="rounded-xl border border-[#eef1f5] bg-white p-2.5">
      <div className="flex gap-2.5">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#EBF5FB] text-[10px] font-bold text-[#009FD9]">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[12px] font-bold text-[#111827] truncate">{name}</span>
            <span className="inline-flex items-center gap-0.5 text-[#16a34a]"><ShieldCheck className="h-3 w-3" /><span className="text-[8px] font-semibold">Verificado</span></span>
          </div>
          <span className="mt-0.5 inline-block rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[8px] font-medium text-[#6b7280]">{profession}</span>
          <div className="mt-1 flex items-center gap-1 text-[9px] text-[#6b7280]">
            <Star className="h-2.5 w-2.5 fill-[#ff9b32] text-[#ff9b32]" /><span className="font-bold text-[#111827]">{rating}</span><span>· {reviews}</span>
            <MapPin className="ml-0.5 h-2.5 w-2.5 text-[#009FD9]" /><span>{place}</span>
          </div>
        </div>
        <div className="text-right"><span className="block text-[8px] text-[#9ca3af]">Desde</span><span className="text-[11px] font-bold text-[#111827]">{price}</span></div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="flex-1 rounded-md bg-[#009FD9] py-1 text-center text-[9px] font-bold text-white">Solicitar servicio</span>
        <span className="grid h-5 w-5 place-items-center rounded-md border border-[#bbf7d0] text-[#16a34a]"><WhatsAppIcon className="h-2.5 w-2.5" /></span>
      </div>
    </div>
  );
}

export function ResultsScreen() {
  return (
    <div className="flex h-full flex-col bg-[#f4f7fa]">
      <AppBar title="Plomería · San José" />
      <div className="flex-1 space-y-2 p-3">
        <p className="text-[9px] font-bold uppercase tracking-wide text-[#9ca3af]">Profesionales verificados</p>
        <MiniCard initials="CR" name="Carlos Ramírez" profession="Plomería" place="San José" rating="4.9" reviews={48} price="₡12 000/h" />
        <MiniCard initials="AM" name="Ana Mora" profession="Plomería" place="Escazú" rating="4.8" reviews={31} price="₡10 000/h" />
        <MiniCard initials="LG" name="Luis Gómez" profession="Plomería" place="Heredia" rating="4.7" reviews={22} price="₡11 000/h" />
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
