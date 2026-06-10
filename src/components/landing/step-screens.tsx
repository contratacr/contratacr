import { Search, MapPin, ShieldCheck, Star, Send } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

/* Shared on-brand mock "app screens" used by both Contrata-en-tres-pasos
   layouts (rows + sticky). They mirror the real ContrataCR UI (search,
   results, WhatsApp coordination) — Stripe/Linear-style real-product visuals. */

function Window({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7ebf0] bg-white shadow-[0_24px_60px_rgba(16,39,68,0.14)]">
      <div className="flex items-center gap-1.5 border-b border-[#f1f3f5] bg-[#f9fafb] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#e0e4e9]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e0e4e9]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#e0e4e9]" />
        <span className="ml-3 truncate text-[11px] font-medium text-[#9ca3af]">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

export function StepSearchScreen() {
  return (
    <Window title="contratacr.com">
      <div className="rounded-xl border border-[#e5e7eb] bg-white p-1.5 flex items-center gap-2 shadow-sm">
        <div className="flex flex-1 items-center gap-2 px-2">
          <Search className="h-4 w-4 text-[#9ca3af]" />
          <span className="text-sm text-[#374151]">Necesito un plomero para una fuga</span>
        </div>
        <span className="hidden sm:flex items-center gap-1 border-l border-[#e5e7eb] pl-2 pr-1 text-sm text-[#6b7280]">
          <MapPin className="h-4 w-4 text-[#9ca3af]" /> San José
        </span>
        <button className="rounded-lg bg-[#009FD9] px-4 py-2 text-sm font-bold text-white">Buscar</button>
      </div>
      <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">Populares</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {["Plomería", "Electricidad", "Limpieza", "Pintura", "Jardinería"].map((c) => (
          <span key={c} className="rounded-full bg-[#f3f4f6] px-3 py-1 text-[12px] font-medium text-[#374151]">{c}</span>
        ))}
      </div>
    </Window>
  );
}

function MiniResult({
  initials, name, profession, place, rating, reviews, price,
}: { initials: string; name: string; profession: string; place: string; rating: string; reviews: number; price: string }) {
  return (
    <div className="rounded-xl border border-[#eef1f5] bg-white p-3">
      <div className="flex gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#EBF5FB] text-xs font-bold text-[#009FD9]">{initials}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-[#111827] truncate">{name}</span>
            <span className="inline-flex items-center gap-0.5 text-[#16a34a]"><ShieldCheck className="h-3 w-3" /><span className="text-[9px] font-semibold">Verificado</span></span>
          </div>
          <span className="mt-0.5 inline-block rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#6b7280]">{profession}</span>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-[#6b7280]">
            <Star className="h-2.5 w-2.5 fill-[#ff9b32] text-[#ff9b32]" />
            <span className="font-bold text-[#111827]">{rating}</span><span>· {reviews} reseñas</span>
            <MapPin className="ml-0.5 h-2.5 w-2.5 text-[#009FD9]" /><span>{place}</span>
          </div>
        </div>
        <div className="text-right">
          <span className="block text-[9px] text-[#9ca3af]">Desde</span>
          <span className="text-[13px] font-bold text-[#111827]">{price}</span>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-1.5">
        <button className="flex-1 rounded-lg bg-[#009FD9] py-1.5 text-[11px] font-bold text-white">Solicitar servicio</button>
        <span className="grid h-7 w-7 place-items-center rounded-lg border border-[#bbf7d0] text-[#16a34a]"><WhatsAppIcon className="h-3.5 w-3.5" /></span>
      </div>
    </div>
  );
}

export function StepResultsScreen() {
  return (
    <Window title="Resultados · Plomería en San José">
      <div className="space-y-2.5">
        <MiniResult initials="CR" name="Carlos Ramírez" profession="Plomería" place="San José" rating="4.9" reviews={48} price="₡12 000/h" />
        <MiniResult initials="AM" name="Ana Mora" profession="Plomería" place="Escazú" rating="4.8" reviews={31} price="₡10 000/h" />
      </div>
    </Window>
  );
}

export function StepChatScreen() {
  return (
    <Window title="WhatsApp · Carlos Ramírez">
      <div className="flex items-center gap-2.5 pb-3 border-b border-[#f1f3f5]">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-[#EBF5FB] text-xs font-bold text-[#009FD9]">CR</div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-[#111827]">Carlos Ramírez</span>
            <span className="inline-flex items-center gap-0.5 text-[#16a34a]"><ShieldCheck className="h-3 w-3" /><span className="text-[9px] font-semibold">Verificado</span></span>
          </div>
          <span className="text-[10px] text-[#16a34a]">en línea</span>
        </div>
      </div>
      <div className="space-y-2 py-3">
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-[#f3f4f6] px-3 py-2 text-[12px] text-[#374151]">
          Hola, tengo una fuga bajo el lavamanos. ¿Podría ir hoy?
        </div>
        <div className="ml-auto max-w-[80%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3 py-2 text-[12px] text-[#1a2744]">
          ¡Claro! Puedo llegar hoy a las 3:00 p. m. El diagnóstico es gratis. 👍
        </div>
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm bg-[#f3f4f6] px-3 py-2 text-[12px] text-[#374151]">
          Perfecto, ahí lo espero. ¡Gracias!
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3 py-1.5">
        <span className="flex-1 text-[12px] text-[#9ca3af]">Escribe un mensaje…</span>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#25D366] text-white"><Send className="h-3.5 w-3.5" /></span>
      </div>
    </Window>
  );
}

export const STEP_SCREENS = [StepSearchScreen, StepResultsScreen, StepChatScreen];

export const STEP_CONTENT = [
  {
    n: "01",
    title: "Describe tu proyecto",
    desc: "Cuéntanos qué necesitas y dónde. Sé tan detallado como quieras para recibir mejores opciones.",
  },
  {
    n: "02",
    title: "Compara profesionales",
    desc: "Revisa perfiles con identidad verificada, reseñas reales, ubicación y disponibilidad.",
  },
  {
    n: "03",
    title: "Coordina y contrata",
    desc: "Hablas directo por WhatsApp con el profesional, sin intermediarios ni cargos extra.",
  },
];
