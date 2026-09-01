"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { MarketplaceNavbarPortal, MarketplaceSearch } from "@/components/marketplace/marketplace-controls";
import { marketplaceLocale } from "@/lib/marketplace-copy";

const COPY = {
  es: {
    placeholder: "¿Qué oferta estás buscando?",
  },
  en: {
    placeholder: "What offer are you looking for?",
  },
} as const;

export function OfferDetailNavbarSearch({ title }: { title: string }) {
  const router = useRouter();
  const copy = COPY[marketplaceLocale(useLocale())];
  const [query, setQuery] = useState("");

  function openOffers(nextQuery = query) {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    router.push(`/ofertas${params.size ? `?${params.toString()}` : ""}`);
  }

  return (
    <MarketplaceNavbarPortal>
      <section className="hidden h-full bg-transparent lg:block">
        <div className="flex h-full w-full items-center py-2">
          <div className="w-full">
            <MarketplaceSearch
              value={query}
              onChange={setQuery}
              onSubmit={() => openOffers()}
              placeholder={copy.placeholder}
              suggestions={[title]}
              recentStorageKey="ccr-offer-search-recents"
      visitSurface="ofertas"
            />
          </div>
        </div>
      </section>
    </MarketplaceNavbarPortal>
  );
}
