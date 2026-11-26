"use client";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";

/** "Explorando: Costa Rica ▾" (Yelp's "Exploring"): opens the search sheet with the cursor in its location field. */
export function HomeFeedLocation() {
  const t = useTranslations("homeFeed");
  return (
    <button type="button" data-home-feed-location
      onClick={() => window.dispatchEvent(new CustomEvent("ccr:open-native-search", { detail: { campo: "ubicacion" } }))}
      className="flex items-center gap-1.5 px-4 text-[15px] text-[#162543]">
      <span className="font-extrabold">{t("exploring")}</span>
      <span className="font-medium">{t("country")}</span>
      <ChevronDown className="h-4 w-4" strokeWidth={2.5} aria-hidden />
    </button>
  );
}
