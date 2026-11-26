"use client";
import { useState } from "react";
import { MessageSquareText, Navigation } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NEAR_COOKIE } from "@/lib/home-feed-near";


/**
 * How the phone home feed is ordered (owner, 2026-11-26): "Más reseñas" (default) or "Cerca de mí". The position is asked
 * only when the visitor taps "Cerca de mí", is rounded and lives one day in a first-party cookie.
 */
export function HomeFeedExplore({ near }: { near: boolean }) {
  const t = useTranslations("homeFeed");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  const set = (value: string | null) => {
    document.cookie = value ? `${NEAR_COOKIE}=${value}; Max-Age=86400; Path=/; SameSite=Lax` : `${NEAR_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
    // A full reload: the feed is a server list read with the cookie (the router cache kept the old order).
    window.location.reload();
  };
  const askNear = () => {
    if (near || busy) return;
    if (!("geolocation" in navigator)) { setProblem(true); return; }
    setBusy(true);
    setProblem(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setBusy(false); set(`${pos.coords.latitude.toFixed(3)},${pos.coords.longitude.toFixed(3)}`); },
      () => { setBusy(false); setProblem(true); },
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 },
    );
  };
  const tab = "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full text-[14px] font-bold transition-colors";
  return (
    <div className="px-4">
      <div role="radiogroup" aria-label={t("orderLabel")} data-home-feed-order className="flex gap-1 rounded-full bg-[#eef3f7] p-1">
        <button type="button" role="radio" aria-checked={!near} data-home-feed-order-option="reviews" onClick={() => near && set(null)}
          className={cn(tab, !near ? "bg-white text-[#162543] shadow-[0_1px_4px_rgba(22,37,67,0.18)]" : "text-[#526277]")}>
          <MessageSquareText className="h-4 w-4" aria-hidden />{t("orderReviews")}
        </button>
        <button type="button" role="radio" aria-checked={near} data-home-feed-order-option="near" onClick={askNear}
          className={cn(tab, near ? "bg-white text-[#162543] shadow-[0_1px_4px_rgba(22,37,67,0.18)]" : "text-[#526277]")}>
          <Navigation className={cn("h-4 w-4", busy && "animate-pulse")} aria-hidden />{busy ? t("locating") : t("orderNear")}
        </button>
      </div>
      {problem && <p role="status" className="mt-2 text-[13px] text-[#9a3412]">{t("locationDenied")}</p>}
    </div>
  );
}
