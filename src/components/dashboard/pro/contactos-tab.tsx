"use client";

import { useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MessageCircle, Phone } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { PanelEmptyState, PanelListSkeleton } from "@/components/ui/content-loading";
import { getCategoryLabel } from "@/lib/data/categories";
import { formatRelativeOrDate } from "@/lib/utils";

/**
 * Quién buscó a este profesional sin tener cuenta.
 *
 * Antes, para escribirle por WhatsApp había que registrarse, y de nueve
 * personas que lo intentaron ocho se fueron. Ahora dejan su nombre y su
 * teléfono, y eso aparece aquí: si no contestó a tiempo, todavía puede devolver
 * la llamada. El aviso ya le llegó al momento; esta lista es para que no se
 * pierda entre los demás avisos.
 */
type Contacto = {
  id: string;
  name: string;
  phone: string;
  channel: string;
  category_id: string | null;
  created_at: string;
};

export function ContactosTab() {
  const { user } = useAuth();
  const locale = useLocale();
  const t = useTranslations("contactos");
  const vacio = useMemo<Contacto[]>(() => [], []);

  const cargar = useCallback(async () => {
    const respuesta = await fetch("/api/contactos", { cache: "no-store" });
    const datos = await respuesta.json().catch(() => ({}));
    return Array.isArray(datos.contactos) ? (datos.contactos as Contacto[]) : [];
  }, []);

  const { data: contactos, loading } = useCachedResource<Contacto[]>(
    user ? `contactos:${user.id}` : null,
    cargar,
    vacio,
    { refreshOn: true },
  );

  if (loading) return <PanelListSkeleton rows={3} />;

  if (contactos.length === 0) {
    return <PanelEmptyState icon={Phone} title={t("emptyTitle")} description={t("emptyBody")} />;
  }

  return (
    <ul className="flex flex-col gap-3">
      {contactos.map((contacto) => {
        const soloDigitos = contacto.phone.replace(/\D/g, "");
        const servicio = contacto.category_id ? getCategoryLabel(contacto.category_id, locale) : "";
        return (
          <li key={contacto.id} className="rounded-2xl border border-[#e5e7eb] bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold leading-tight text-[#162543]">{contacto.name}</p>
                <p className="mt-1 text-[13px] text-[#52627a]">
                  {contacto.phone}{servicio ? ` · ${servicio}` : ""}
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-[#8b98a9]">
                {formatRelativeOrDate(contacto.created_at, locale)}
              </span>
            </div>
            {/* Lo que hace falta es devolverle: los dos botones son eso. */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={`https://wa.me/${soloDigitos}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#25d366] px-4 text-[13px] font-bold text-white transition-colors hover:bg-[#1da851]"
              >
                <MessageCircle className="h-4 w-4" />WhatsApp
              </a>
              <a
                href={`tel:+${soloDigitos}`}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#d7e1ea] bg-white px-4 text-[13px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]"
              >
                <Phone className="h-4 w-4" />{t("call")}
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
