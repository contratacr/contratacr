"use client";
import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type HomeCategoryTile = { key: string; href: string; label: string; photo: string };

/**
 * Home «Categorías más buscadas» (owner 2026-11-26): the same two tabs as /categorias — Servicios (open first) and
 * Negocios — each with its six most searched tiles and the same photos. «Ver todas» opens Categorías on that tab.
 */
export function HomeCategoriesTabs({ title, allLabel, allShort, tabs }: {
  title: string; allLabel: string; allShort: string;
  tabs: { id: "servicios" | "negocios"; label: string; items: HomeCategoryTile[] }[];
}) {
  const visibles = tabs.filter((x) => x.items.length > 0);
  const [activa, setActiva] = useState(visibles[0]?.id ?? "servicios");
  const actual = visibles.find((x) => x.id === activa) ?? visibles[0];
  if (!actual) return null;
  const verTodas = actual.id === "negocios" ? "/categorias?vista=negocios" : "/categorias";
  return (
    <section data-home-categories className="bg-white px-4 pb-6 pt-5">
      <div className="mx-auto mb-3 flex max-w-6xl items-center justify-between gap-3 sm:mb-4">
        <h2 className="text-[22px] font-extrabold leading-tight text-[#1a2744] sm:text-3xl">{title}</h2>
        <Link href={verTodas} prefetch={false} aria-label={allLabel} className="flex shrink-0 items-center gap-0.5 text-[15px] font-bold text-[#0083b0]">{allShort}<ChevronRight className="h-4 w-4" aria-hidden /></Link>
      </div>
      {visibles.length > 1 && (
        <div role="tablist" aria-label={title} className="mx-auto mb-4 grid max-w-6xl grid-cols-2 gap-1 rounded-full bg-[#eef2f6] p-1 sm:max-w-sm sm:mx-0 lg:mx-auto lg:max-w-6xl lg:grid-cols-[repeat(2,12rem)] lg:justify-start">
          {visibles.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={x.id === actual.id} data-home-categories-tab={x.id} onClick={() => setActiva(x.id)}
              className={cn("h-10 rounded-full text-[15px] font-bold transition-colors", x.id === actual.id ? "bg-white text-[#162543] shadow-sm" : "text-[#526277]")}>
              {x.label}
            </button>
          ))}
        </div>
      )}
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3" data-home-categories-grid={actual.id}>
        {actual.items.map((i) => (
          <li key={i.key}>
            <Link href={i.href} prefetch={false} data-home-category={i.key} className="group relative block aspect-[4/5] overflow-hidden rounded-2xl bg-[#e8eef3] shadow-[0_6px_18px_-12px_rgba(15,23,42,0.45)] lg:aspect-[16/10]">
              {/* eslint-disable-next-line @next/next/no-img-element -- remote CDN photo, sized by the URL */}
              <img src={i.photo} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.06] group-active:scale-[1.06]" />
              <span aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.25) 25%, rgba(0,0,0,0) 45%)" }} />
              <span className="absolute inset-x-0 bottom-0 p-3.5 text-[15px] font-bold leading-tight text-white drop-shadow sm:p-4 sm:text-base lg:p-6 lg:text-2xl">{i.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
