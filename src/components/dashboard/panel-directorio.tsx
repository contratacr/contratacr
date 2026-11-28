"use client";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { PanelListSkeleton } from "@/components/ui/content-loading";
import { MyListsTabs, type ListSuggestion } from "@/components/directory/my-lists-tabs";
import { MyReservationsList } from "@/components/directory/my-reservations-list";
import type { SavedList } from "@/lib/directory/place-features";
import type { MyReservationRow } from "@/lib/directory/my-reservations";

// Directory pages of the signed-in person that live inside «Mi panel» (owner, 2026-11-27; directory on only):
// «Mis listas» (Guardados → ?tab=saved&vista=listas) and «Mis reservas» (?tab=mis_reservas). Same content as the old
// /listas and /mis-reservas pages, which now redirect here when there is a session.
type Carga<T> = { estado: "cargando" } | { estado: "error" } | { estado: "listo"; datos: T };

function useCarga<T>(url: string, leer: (j: unknown) => T | null): Carga<T> {
  const [carga, setCarga] = useState<Carga<T>>({ estado: "cargando" });
  useEffect(() => {
    let vivo = true;
    fetch(url, { cache: "no-store" })
      .then(async (r) => { const datos = r.ok ? leer(await r.json().catch(() => null)) : null; if (vivo) setCarga(datos ? { estado: "listo", datos } : { estado: "error" }); })
      .catch(() => { if (vivo) setCarga({ estado: "error" }); });
    return () => { vivo = false; };
    // `leer` is a pure parser; the address alone decides the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  return carga;
}

export function PanelMisListas() {
  const locale = useLocale();
  const en = locale === "en";
  const carga = useCarga(`/api/listas?sugerencias=${en ? "en" : "es"}`, (j) => {
    const v = j as { items?: SavedList[]; suggestions?: ListSuggestion[] } | null;
    return Array.isArray(v?.items) ? { items: v.items, suggestions: Array.isArray(v.suggestions) ? v.suggestions : [] } : null;
  });
  if (carga.estado === "cargando") return <PanelListSkeleton rows={3} withTabs />;
  if (carga.estado === "error") return <p role="alert" className="p-4">{en ? "Could not load your lists. Please reload." : "No se pudieron cargar sus listas. Recargue la página."}</p>;
  return (
    <div data-lists-page data-panel-lists className="text-[#162543]">
      <MyListsTabs locale={locale} initial={carga.datos.items} origin={window.location.origin} suggestions={carga.datos.suggestions} embedded />
    </div>
  );
}

export function PanelMisReservas() {
  const locale = useLocale();
  const en = locale === "en";
  const carga = useCarga(`/api/mis-reservas?locale=${en ? "en" : "es"}`, (j) => {
    const v = j as { items?: MyReservationRow[] } | null;
    return Array.isArray(v?.items) ? v.items : null;
  });
  return (
    <div data-my-reservations data-panel-reservations className="space-y-4 text-[#162543]">
      <p className="text-[15px] text-slate-700">{en ? "Table reservations and waitlist entries you made with your account. Open one to see its status or cancel it." : "Reservas de mesa y listas de espera que pidió con su cuenta. Abra una para ver su estado o cancelarla."}</p>
      {carga.estado === "cargando" ? <PanelListSkeleton rows={2} /> : <MyReservationsList rows={carga.estado === "listo" ? carga.datos : null} failed={carga.estado === "error"} en={en} />}
    </div>
  );
}
