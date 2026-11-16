"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PanelListSkeleton } from "@/components/ui/content-loading";

type Invitation = { suggestionId: string; categoryId: string; name: string; nameEn?: string; link: string; dismissed: boolean };
// CERRAR CON LA X (15-nov-2026): antes "Ahora no" lo dejaba fijo en Servicios
// para siempre, sin forma de quitarlo. Cerrar lo oculta para siempre; el
// servicio ya está en el catálogo y se agrega con "Agregar servicio".
export function ServiceRequestInvitations({ onComplete }: { onComplete?: (categoryId: string) => void }) {
  const t = useTranslations("serviceRequests");
  const locale = useLocale();
  const [items, setItems] = useState<Invitation[]>([]);
  const [error, setError] = useState(false);
  // Solo la primera consulta enseña el esqueleto; las recargas al volver a la
  // ventana (focus) o al guardar servicios actualizan sin parpadear.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/categories/requests", { cache: "no-store" }).then(async r => {
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (active) { setItems(data.invitations ?? []); setError(false); }
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoaded(true); });
    void load();
    window.addEventListener("ccr:services-saved", load);
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("ccr:services-saved", load); window.removeEventListener("focus", load); };
  }, []);
  async function cerrar(suggestionId: string) {
    const response = await fetch("/api/categories/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suggestionId }) }).catch(() => null);
    if (!response?.ok) { setError(true); return; }
    setItems(current => current.map(i => i.suggestionId === suggestionId ? { ...i, dismissed: true } : i));
  }
  const visible = items.filter((i, index) => !i.dismissed && items.findIndex(other => other.categoryId === i.categoryId) === index);
  if (!loaded) return <PanelListSkeleton rows={1} compacto className="mb-4" />;
  if (!visible.length) return null;
  return <div className="mb-4 space-y-3" data-testid="service-request-invitations">
    {visible.map(item => <div key={item.suggestionId} className="relative rounded-2xl border border-[#bfe8f5] bg-[#f0faff] p-4 pr-12">
      <button type="button" onClick={() => void cerrar(item.suggestionId)} aria-label={t("close")} data-testid="service-request-invitation-close" className="absolute right-1.5 top-1.5 grid h-11 w-11 place-items-center rounded-full text-[#52627a] hover:bg-white/70 hover:text-[#162543]"><X className="h-5 w-5" /></button>
      <p className="font-bold text-[#162543]">{t("title")}</p>
      <p className="mt-1 text-sm text-[#52627a]">{t("body", { service: ({ es: item.name, en: item.nameEn || item.name } as Record<string, string>)[locale] || item.name })}</p>
      <div className="mt-3">
        <Link href={item.link} onClick={event => {
          if (!onComplete || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          onComplete(item.categoryId);
        }} className="inline-flex rounded-full bg-[#009FD9] px-4 py-2 text-sm font-bold text-white">{t("complete")}</Link>
      </div>
    </div>)}
    {error && <p role="alert" className="text-sm text-red-700">{t("error")}</p>}
  </div>;
}
