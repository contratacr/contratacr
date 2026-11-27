"use client";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Bookmark, ChevronRight, Info, MoreHorizontal, Search, Star, X, type LucideIcon } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useSiteFeatures } from "@/components/site-features";
import { rutaDeBusqueda } from "@/lib/buscar-url";
import { categoryIcon, sectionIcon } from "@/lib/visuals/section-visuals";
import { MoreCategories } from "./more-categories";
import { SearchEntry } from "./search-entry";
import { SaveToList } from "./save-to-list";
import type { TopPlace } from "./app-home-data";

/**
 * Search tab of the mobile app (Yelp home model, our colours): category icon row, rotating search pill, "Top 10" band.
 * Shown below lg only (page.tsx hides the desktop landing there). The pill opens the search-entry overlay; the "Más"
 * tile opens "Más categorías". Cards of the band are real places only (best rated, at least one review).
 */
type Tile = { key: string; es: string; en: string; icon: LucideIcon; href: string; section?: string };
const TILES: Tile[] = [
  { key: "restaurantes", es: "Restaurantes", en: "Restaurants", icon: sectionIcon("restaurantes"), href: "/restaurantes", section: "restaurantes" },
  { key: "talleres", es: "Taller mecánico", en: "Auto repair", icon: sectionIcon("talleres"), href: "/talleres", section: "talleres" },
  { key: "mudanzas", es: "Mudanzas", en: "Movers", icon: categoryIcon("mudanzas"), href: rutaDeBusqueda({ categoria: "mudanzas" }) },
  { key: "plomeros", es: "Plomeros", en: "Plumbers", icon: categoryIcon("plomeria"), href: rutaDeBusqueda({ categoria: "plomeria" }) },
  { key: "limpieza", es: "Limpieza", en: "Cleaning", icon: categoryIcon("limpieza"), href: rutaDeBusqueda({ categoria: "limpieza" }) },
];
const RestaurantIcon = sectionIcon("restaurantes");
const PLACEHOLDERS = [
  { es: "Buscar plomeros", en: "Search plumbers" },
  { es: "Buscar taller mecánico", en: "Search auto repair" },
  { es: "Buscar restaurantes nuevos y populares", en: "Search new and popular restaurants" },
];

function useRotatingIndex(length: number, ms = 3000) {
  const [i, setI] = useState(0);
  useEffect(() => {
    let reduce = false;
    try { reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { /* no matchMedia */ }
    if (reduce) return;
    const id = window.setInterval(() => setI((v) => (v + 1) % length), ms);
    return () => window.clearInterval(id);
  }, [length, ms]);
  return i;
}

/** Bookmark of a card: asks the session first (login when signed out), then shows the existing SaveToList panel. */
function SaveBookmark({ slug, name, locale }: { slug: string; name: string; locale: string }) {
  const en = locale === "en";
  const t = (es: string, e: string) => (en ? e : es);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/listas?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      if (r.status === 401) { router.push(`/login?redirect=${encodeURIComponent("/")}`); return; }
      setOpen(true);
    } catch { setOpen(true); } finally { setBusy(false); }
  };
  return (
    <>
      <button type="button" onClick={start} disabled={busy} aria-label={t(`Guardar ${name}`, `Save ${name}`)} data-home-save={slug}
        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#162543] shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]">
        <Bookmark className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div className="fixed inset-0 z-[96] flex items-end bg-black/40" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-label={t("Guardar en una lista", "Save to a list")}>
          <div className="w-full rounded-t-3xl bg-white p-5 pb-[calc(2rem+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between"><p className="text-[16px] font-extrabold">{name}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Cerrar", "Close")} className="inline-flex h-9 w-9 items-center justify-center rounded-full"><X className="h-5 w-5" aria-hidden /></button></div>
            <SaveToList slug={slug} locale={locale} signedIn loginHref={null} />
          </div>
        </div>
      )}
    </>
  );
}

export function AppHome({ topPlaces }: { topPlaces: TopPlace[] }) {
  const locale = useLocale();
  const en = locale === "en";
  const t = (es: string, e: string) => (en ? e : es);
  const { directorySections } = useSiteFeatures();
  const [entry, setEntry] = useState<null | "text">(null);
  const [more, setMore] = useState(false);
  const [tip, setTip] = useState(false);
  const idx = useRotatingIndex(PLACEHOLDERS.length);
  const tiles = TILES.filter((x) => !x.section || directorySections.includes(x.section));
  const count = topPlaces.length;
  const nf = new Intl.NumberFormat(en ? "en-US" : "es-CR");

  return (
    <div data-app-home className="bg-white pb-8 text-[#162543]">
      <div className="mx-auto w-full max-w-xl px-4 pt-3">
        <h1 className="sr-only">{t("Buscar", "Search")}</h1>
        <ul className="-mx-3 grid grid-cols-6" data-home-categories>
          {tiles.map((x) => {
            const Icon = x.icon;
            return (
              <li key={x.key} className="min-w-0">
                <Link href={x.href} data-home-tile={x.key} className="flex flex-col items-center gap-1.5 rounded-xl py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF5FB] text-[#007fae]"><Icon className="h-[22px] w-[22px]" aria-hidden /></span>
                  <span className="text-center text-[10.5px] font-bold leading-tight tracking-tight">{en ? x.en : x.es}</span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button type="button" onClick={() => setMore(true)} data-home-tile="mas" className="flex w-full flex-col items-center gap-1.5 rounded-xl py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#162543] text-white"><MoreHorizontal className="h-[22px] w-[22px]" aria-hidden /></span>
              <span className="text-center text-[10.5px] font-bold leading-tight tracking-tight">{t("Más", "More")}</span>
            </button>
          </li>
        </ul>

        <div className="mt-3 flex h-[52px] items-center rounded-full border border-[#d7e1ea] bg-white pl-1.5 pr-1 shadow-[0_6px_18px_-10px_rgba(22,37,67,0.45)]" data-home-search>
          <button type="button" onClick={() => setEntry("text")} data-home-search-open aria-label={t("Buscar", "Search")} className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#009FD9] text-white"><Search className="h-5 w-5" aria-hidden /></span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#5b6b82]" data-home-placeholder>{en ? PLACEHOLDERS[idx].en : PLACEHOLDERS[idx].es}</span>
          </button>
        </div>

        <section aria-labelledby="home-top10" data-home-top10 className="mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-[#fff1cf] via-[#fbe7d2] to-[#d6effa] p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h2 id="home-top10" className="text-[22px] font-extrabold leading-7">{t("Desbloquee su top 10", "Unlock your top 10")}</h2>
              <div className="mt-1 flex items-center gap-1.5">
                <p className="text-[13px] font-semibold text-[#4a5b73]">{t("Lo mejor calificado de la comunidad", "The community's best rated")}</p>
                <button type="button" onClick={() => setTip((v) => !v)} aria-expanded={tip} aria-label={t("Cómo se arma esta lista", "How this list is made")} data-home-top10-info className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#162543]"><Info className="h-4 w-4" aria-hidden /></button>
              </div>
              {tip && <p role="status" data-home-top10-tip className="mt-1 rounded-xl bg-white/90 p-3 text-[13px] leading-snug shadow-sm">{t("Para esta lista, analizamos aportes, calificaciones, volumen de reseñas y opinión de la comunidad.", "For this list, we analyze contributions, ratings, review volume and community opinion.")}</p>}
            </div>
            <Link href="/restaurantes" aria-label={t("Ver la lista completa", "See the full list")} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#162543] text-white"><ChevronRight className="h-5 w-5" aria-hidden /></Link>
          </div>
          {count > 0 && (
            <ul className="scrollbar-none -mx-4 mt-4 flex gap-3 overflow-x-auto px-4 pb-1" data-home-top-cards>
              {topPlaces.map((p, i) => (
                <li key={p.slug} className="relative w-[148px] shrink-0">
                  <Link href={`/negocios/${p.slug}`} data-home-top-card={p.slug} className="block overflow-hidden rounded-2xl bg-white shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#009FD9]">
                    <span className="relative block h-[148px] bg-[#EBF5FB]">
                      {p.photo
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={p.photo} alt="" loading="lazy" className="h-full w-full object-cover" />
                        : <span className="flex h-full items-center justify-center text-[#007fae]"><RestaurantIcon className="h-8 w-8" aria-hidden /></span>}
                      <span className="absolute left-2 top-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#162543] px-1.5 text-[13px] font-extrabold text-white">{count - i}</span>
                    </span>
                    <span className="block p-2.5">
                      <span className="block truncate text-[14px] font-bold">{p.name}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-[12.5px] font-semibold"><Star className="h-3.5 w-3.5 fill-[#009FD9] text-[#009FD9]" aria-hidden />{(p.average ?? 0).toLocaleString(en ? "en-US" : "es-CR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} <span className="font-medium text-[#5b6b82]">({nf.format(p.count)})</span></span>
                      {p.area && <span className="block truncate text-[12px] text-[#5b6b82]">{p.area}</span>}
                    </span>
                  </Link>
                  <SaveBookmark slug={p.slug} name={p.name} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {entry && <SearchEntry onClose={() => setEntry(null)} />}
      {more && <MoreCategories variant="sheet" onClose={() => setMore(false)} />}
    </div>
  );
}
