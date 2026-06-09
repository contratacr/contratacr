import Image from "next/image";
import { Search, MapPin, ShieldCheck, Star } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

/* ── Fixed phone mockup showing a REAL ContrataCR screen ──
   Swap point: set PHONE_SCREEN.src to a self-hosted Cloudinary screenshot of the
   actual app (e.g. /buscar results) and it renders inside the frame instead of
   the JSX placeholder. The placeholder below is a faithful, on-brand recreation
   of our real /buscar result cards (NOT a generic/unrelated screen). */
const PHONE_SCREEN: { src: string | null; alt: string } = {
  src: null,
  alt: "Pantalla de ContrataCR — resultados de búsqueda de profesionales",
};

// One illustrative /buscar result card (mirrors the real ProfessionalCard).
function MiniCard({
  initials, name, profession, place, rating, reviews, price, verified,
}: {
  initials: string; name: string; profession: string; place: string;
  rating: string; reviews: number; price: string; verified: boolean;
}) {
  return (
    <div className="rounded-xl border border-[#eef1f5] bg-white p-2.5 shadow-[0_2px_10px_rgba(16,39,68,0.05)]">
      <div className="flex gap-2.5">
        <div className="h-9 w-9 shrink-0 rounded-full bg-[#EBF5FB] grid place-items-center text-[10px] font-bold text-[#009FD9]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-[#111827] truncate">{name}</span>
            {verified ? (
              <span className="inline-flex items-center gap-0.5 text-[#16a34a]">
                <ShieldCheck className="h-2.5 w-2.5" />
                <span className="text-[8px] font-semibold">Verificado</span>
              </span>
            ) : (
              <span className="text-[8px] font-medium text-[#b45309]">Sin verificar</span>
            )}
          </div>
          <span className="mt-0.5 inline-block rounded-full bg-[#f3f4f6] px-1.5 py-0.5 text-[8px] font-medium text-[#6b7280]">{profession}</span>
          <div className="mt-1 flex items-center gap-1 text-[8px] text-[#6b7280]">
            <Star className="h-2 w-2 fill-[#ff9b32] text-[#ff9b32]" />
            <span className="font-bold text-[#111827]">{rating}</span>
            <span>· {reviews} reseñas</span>
            <MapPin className="h-2 w-2 text-[#009FD9] ml-0.5" />
            <span className="truncate">{place}</span>
          </div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <span className="text-[8px] text-[#9ca3af]">Desde</span>
        <span className="text-[11px] font-bold text-[#111827]">{price}</span>
        <button className="ml-auto rounded-md bg-[#009FD9] px-2.5 py-1 text-[8px] font-bold text-white">Solicitar servicio</button>
        <span className="grid h-5 w-5 place-items-center rounded-md border border-[#bbf7d0] text-[#16a34a]">
          <WhatsAppIcon className="h-2.5 w-2.5" />
        </span>
      </div>
    </div>
  );
}

function BuscarScreen() {
  return (
    <div className="flex h-full flex-col bg-[#f4f7fa]">
      {/* App bar */}
      <div className="bg-white px-3.5 pt-2 pb-3 border-b border-[#eef1f5]">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[12px] font-extrabold tracking-tight text-[#1a2744]">Contrata<span className="text-[#009FD9]">CR</span></span>
          <span className="h-5 w-5 rounded-full bg-[#EBF5FB]" />
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-[#e5e7eb] bg-white px-2.5 py-1.5">
          <Search className="h-3 w-3 text-[#9ca3af]" />
          <span className="text-[10px] text-[#6b7280]">Plomería</span>
          <span className="mx-1 h-3 w-px bg-[#e5e7eb]" />
          <MapPin className="h-3 w-3 text-[#9ca3af]" />
          <span className="text-[10px] text-[#6b7280]">San José</span>
        </div>
      </div>
      {/* Results */}
      <div className="flex-1 space-y-2 overflow-hidden px-3 py-3">
        <p className="text-[9px] font-bold uppercase tracking-wide text-[#9ca3af]">Profesionales disponibles</p>
        <MiniCard initials="CR" name="Carlos Ramírez" profession="Plomería" place="San José" rating="4.9" reviews={48} price="₡12 000/h" verified />
        <MiniCard initials="AM" name="Ana Mora" profession="Plomería" place="Escazú" rating="4.8" reviews={31} price="₡10 000/h" verified />
        <MiniCard initials="LG" name="Luis Gómez" profession="Plomería" place="Heredia" rating="—" reviews={0} price="A convenir" verified={false} />
      </div>
    </div>
  );
}

export function AppPhone({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto ${className}`} style={{ width: 270 }}>
      {/* Bezel */}
      <div
        className="relative"
        style={{
          background: "linear-gradient(145deg,#111827,#0b1220)",
          borderRadius: 44,
          padding: 11,
          boxShadow: "0 50px 100px -20px rgba(15,23,42,0.55), 0 0 0 1px rgba(255,255,255,0.05) inset",
        }}
      >
        {/* Dynamic-island */}
        <div className="absolute z-20" style={{ top: 15, left: "50%", transform: "translateX(-50%)", width: 86, height: 24, background: "#000", borderRadius: 13 }} />
        {/* Screen */}
        <div className="relative overflow-hidden bg-white" style={{ borderRadius: 34, height: 540 }}>
          {/* Status bar */}
          <div className="flex items-center justify-between bg-white px-5 pt-3.5 pb-1">
            <span className="text-[10px] font-semibold text-[#1a2744]">9:41</span>
            <span className="inline-block h-2 w-4 rounded-sm border border-[#1a2744]"><span className="m-px block h-1 w-2.5 rounded-[1px] bg-[#1a2744]" /></span>
          </div>
          <div className="h-[calc(540px-26px)]">
            {PHONE_SCREEN.src ? (
              <div className="relative h-full w-full">
                <Image src={PHONE_SCREEN.src} alt={PHONE_SCREEN.alt} fill className="object-cover object-top" sizes="248px" />
              </div>
            ) : (
              <BuscarScreen />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
