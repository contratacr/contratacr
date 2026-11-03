"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type Invitation = { suggestionId: string; categoryId: string; name: string; nameEn?: string; link: string; dismissed: boolean };
export function ServiceRequestInvitations({ showDeferred = false }: { showDeferred?: boolean }) {
  const t = useTranslations("serviceRequests");
  const locale = useLocale();
  const [items, setItems] = useState<Invitation[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/categories/requests", { cache: "no-store" }).then(async r => {
      if (!r.ok) throw new Error();
      const data = await r.json();
      if (active) { setItems(data.invitations ?? []); setError(false); }
    }).catch(() => { if (active) setError(true); });
    void load();
    window.addEventListener("ccr:services-saved", load);
    window.addEventListener("focus", load);
    return () => { active = false; window.removeEventListener("ccr:services-saved", load); window.removeEventListener("focus", load); };
  }, []);
  async function defer(suggestionId: string) {
    const response = await fetch("/api/categories/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ suggestionId }) }).catch(() => null);
    if (!response?.ok) { setError(true); return; }
    setItems(current => current.map(i => i.suggestionId === suggestionId ? { ...i, dismissed: true } : i));
  }
  const visible = items.filter((i, index) => (showDeferred || !i.dismissed) && items.findIndex(other => other.categoryId === i.categoryId) === index);
  if (!visible.length) return null;
  return <div className="mb-4 space-y-3" data-testid="service-request-invitations">
    {visible.map(item => <div key={item.suggestionId} className="rounded-2xl border border-[#bfe8f5] bg-[#f0faff] p-4">
      <p className="font-bold text-[#162543]">{t("title")}</p>
      <p className="mt-1 text-sm text-[#52627a]">{t("body", { service: ({ es: item.name, en: item.nameEn || item.name } as Record<string, string>)[locale] || item.name })}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Link href={item.link} className="rounded-full bg-[#009FD9] px-4 py-2 text-sm font-bold text-white">{t("complete")}</Link>
        {!item.dismissed && <button type="button" onClick={() => void defer(item.suggestionId)} className="px-2 py-2 text-sm font-semibold text-[#52627a]">{t("later")}</button>}
      </div>
    </div>)}
    {error && <p role="alert" className="text-sm text-red-700">{t("error")}</p>}
  </div>;
}
