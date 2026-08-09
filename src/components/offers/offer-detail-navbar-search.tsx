"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { MarketplaceNavbarPortal, MarketplaceSearch } from "@/components/marketplace/marketplace-controls";

export function OfferDetailNavbarSearch({ title, service }: { title: string; service?: string | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [serviceQuery, setServiceQuery] = useState("");

  function openOffers(nextQuery = query, nextService = serviceQuery) {
    const params = new URLSearchParams();
    if (nextQuery.trim()) params.set("q", nextQuery.trim());
    if (nextService.trim()) params.set("service", nextService.trim());
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
              placeholder="¿Qué oferta estás buscando?"
              suggestions={[title]}
              recentStorageKey="ccr-offer-search-recents"
              secondary={{
                value: serviceQuery,
                onChange: setServiceQuery,
                placeholder: "Servicio",
                ariaLabel: "Servicio",
                suggestions: service ? [service] : [],
              }}
            />
          </div>
        </div>
      </section>
    </MarketplaceNavbarPortal>
  );
}
