"use client";

import { useTranslations } from "next-intl";
import { MessageCircle, Star, Tag } from "lucide-react";

/**
 * DOS COSAS QUE MÁS HACEN QUE UN CLIENTE ESCRIBA (8-oct-2026).
 *
 * Medido ese día: de 313 profesionales activos, 14 tenían al menos una reseña y
 * 21 un precio de referencia (la casilla «a convenir» cuenta como completo en la
 * lista del perfil, así que casi nadie ponía uno). En las apps grandes una sola
 * reseña sube las contrataciones ~70 % (Thumbtack) y mostrar el precio subió la
 * satisfacción 40 puntos (TaskRabbit). Cada consejo sale solo mientras falte.
 */

type Servicio = { active?: unknown; priceAmount?: unknown; priceType?: unknown };

function tienePrecioDeReferencia(servicios: unknown): boolean {
  if (!Array.isArray(servicios)) return false;
  return servicios.some((s: Servicio) =>
    s && typeof s === "object" && s.active !== false
    && typeof s.priceAmount === "number" && s.priceAmount > 0 && s.priceType !== "a_convenir");
}

export function ConsejosParaClientes({
  resenas,
  servicios,
  enlaceDeResenas,
  locale,
  alAgregarPrecio,
}: {
  resenas: number;
  servicios: unknown;
  /** Enlace público de la ficha en la pestaña de reseñas. */
  enlaceDeResenas: string;
  locale: string;
  alAgregarPrecio: () => void;
}) {
  const tKit = useTranslations("shareKit");
  const en = locale === "en";
  const faltanResenas = resenas <= 0;
  const faltaPrecio = !tienePrecioDeReferencia(servicios);
  if (!faltanResenas && !faltaPrecio) return null;

  const mensaje = tKit("reviewsMessage", { url: enlaceDeResenas });
  const fila = "flex items-start gap-3 rounded-2xl border border-[#e5e7eb] bg-white p-4";
  const icono = "ccr-caja-icono grid h-10 w-10 shrink-0 place-items-center rounded-xl";
  const boton = "mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-[#009FD9] px-4 text-[13px] font-bold text-white transition hover:bg-[#0089bb]";

  return (
    <div className="flex flex-col gap-2.5" data-consejos-clientes>
      <p className="px-1 text-[12px] font-bold uppercase tracking-[0.06em] text-[#68778d]">
        {en ? "Get more messages" : "Para recibir más mensajes"}
      </p>
      {faltanResenas && (
        <div className={fila} data-consejo="resenas">
          <span className={icono}><Star className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-[#162543]">{en ? "Ask for your first reviews" : "Pide tus primeras reseñas"}</p>
            <p className="mt-0.5 text-[13px] leading-5 text-[#4b5b70]">
              {en
                ? "Profiles with at least one review get many more messages. Send this to 3 clients you have already worked with."
                : "Los perfiles con al menos una reseña reciben muchos más mensajes. Mándale esto a 3 clientes con los que ya trabajaste."}
            </p>
            <a href={`https://wa.me/?text=${encodeURIComponent(mensaje)}`} target="_blank" rel="noopener noreferrer" className={boton}>
              <MessageCircle className="h-4 w-4" /> {en ? "Ask on WhatsApp" : "Pedir por WhatsApp"}
            </a>
          </div>
        </div>
      )}
      {faltaPrecio && (
        <div className={fila} data-consejo="precio">
          <span className={icono}><Tag className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-[#162543]">{en ? "Add a starting price" : "Agrega un precio de referencia"}</p>
            <p className="mt-0.5 text-[13px] leading-5 text-[#4b5b70]">
              {en
                ? "Clients write more when they see a “from ₡” price. You can still agree the final price with each client."
                : "El cliente se anima más a escribir cuando ve un «desde ₡». El precio final lo sigues acordando con cada cliente."}
            </p>
            <button type="button" onClick={alAgregarPrecio} className={boton}>
              <Tag className="h-4 w-4" /> {en ? "Add price" : "Agregar precio"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
