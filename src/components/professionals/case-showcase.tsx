"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Images, User2, CalendarDays, X, ChevronLeft, ChevronRight } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";
import { cldThumb, cldLarge } from "@/lib/cloudinary";
import { CaseLikeButton } from "@/components/professionals/case-like-button";
import { cn } from "@/lib/utils";

export type ShowcaseCase = {
  id: string;
  profession: string;
  title?: string;
  description?: string;
  recipient?: string;
  date?: string;
  photos: string[];
  likes?: number;
  likeable?: boolean;
};

// Client-facing "Casos de éxito" showcase (the public profile). A profession filter
// ("Todos" + per-profession counts) over a grid of case cards — cover photo + N-fotos
// badge + profession tag + title + short description + recipient/date + "Me gusta".
// Tapping a card opens a photo lightbox (same carousel as ProfileGallery).
export function CaseShowcase({
  professionalId,
  cases,
  professions,
}: {
  professionalId: string;
  cases: ShowcaseCase[];
  /** The pro's professions, in display order — used to order + label the filter chips. */
  professions: string[];
}) {
  const locale = useLocale();
  const t = useTranslations("profile");
  const tg = useTranslations("gallery");
  const [active, setActive] = useState<string>("all");
  // The opened case's photos + current index — null when the lightbox is closed.
  const [box, setBox] = useState<{ photos: string[]; i: number } | null>(null);

  const profLabel = useCallback(
    (p: string) => getCategoryLabel(p, locale) || t("otherWorks"),
    [locale, t]
  );

  // Distinct professions that actually have cases (the pro's own first, then any extras
  // from work tagged to a profession they no longer list) — drives the filter chips.
  const distinctProfs = useMemo(() => {
    const inOrder = professions.filter((p) => cases.some((c) => c.profession === p));
    const extras = [...new Set(cases.map((c) => c.profession))].filter((p) => p && !professions.includes(p));
    return [...inOrder, ...extras];
  }, [professions, cases]);
  const showFilter = distinctProfs.length > 1;
  const countFor = (p: string) => cases.filter((c) => c.profession === p).length;
  const shown = active === "all" ? cases : cases.filter((c) => c.profession === active);

  // ── Lightbox nav (Esc / ← / →) ──
  const close = useCallback(() => setBox(null), []);
  const prev = useCallback(() => setBox((b) => (b ? { ...b, i: (b.i - 1 + b.photos.length) % b.photos.length } : b)), []);
  const next = useCallback(() => setBox((b) => (b ? { ...b, i: (b.i + 1) % b.photos.length } : b)), []);
  useEffect(() => {
    if (!box) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [box, close, prev, next]);

  return (
    <div className="flex flex-col gap-5">
      {showFilter && (
        <div className="flex flex-wrap gap-2">
          {[{ id: "all", n: cases.length }, ...distinctProfs.map((p) => ({ id: p, n: countFor(p) }))].map((tab) => {
            const on = active === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  on ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#e5e7eb] bg-white text-[#374151] hover:bg-[#f9fafb]"
                )}
              >
                {tab.id === "all" ? t("casosAll") : profLabel(tab.id)}
                <span className={cn("text-[11px] font-bold tabular-nums", on ? "text-white/90" : "text-[#9ca3af]")}>({tab.n})</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => {
          const hasFooter = !!(c.recipient || c.date || c.likeable);
          return (
            <div key={c.id} className="flex flex-col overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm transition-shadow hover:shadow-md">
              {c.photos[0] && (
                <button
                  type="button"
                  onClick={() => setBox({ photos: c.photos, i: 0 })}
                  className="group relative block aspect-[4/3] overflow-hidden bg-[#f3f4f6]"
                  aria-label={c.title || tg("workAlt", { n: 1 })}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cldThumb(c.photos[0], 600)} alt={c.title ?? ""} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
                  {c.photos.length > 1 && (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white">
                      <Images className="h-3 w-3" /> {t("casosPhotos", { count: c.photos.length })}
                    </span>
                  )}
                </button>
              )}
              <div className="flex flex-1 flex-col p-4">
                <p className="text-[11px] font-semibold text-[#0089bb]">{profLabel(c.profession)}</p>
                {c.title && <p className="mt-0.5 text-[15px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere]">{c.title}</p>}
                {c.description && <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#6b7280] [overflow-wrap:anywhere]">{c.description}</p>}
                {hasFooter && (
                  <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#f3f4f6] pt-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {c.recipient ? (
                        <>
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[#374151]"><User2 className="h-3.5 w-3.5" /></span>
                          <div className="min-w-0 leading-tight">
                            <p className="truncate text-[12px] font-medium text-[#374151] [overflow-wrap:anywhere]">{c.recipient}</p>
                            {c.date && <p className="truncate text-[11px] text-[#9ca3af]">{c.date}</p>}
                          </div>
                        </>
                      ) : c.date ? (
                        <span className="inline-flex items-center gap-1.5 text-[12px] text-[#6b7280]"><CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#374151]" /> {c.date}</span>
                      ) : null}
                    </div>
                    {c.likeable && <CaseLikeButton professionalId={professionalId} caseId={c.id} initialLikes={c.likes ?? 0} label={t("likeLabel")} />}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Lightbox carousel ── */}
      {box && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 p-4" onClick={close}>
          <button onClick={close} className="absolute right-4 top-4 text-white/80 hover:text-white" aria-label={tg("close")}>
            <X className="h-7 w-7" />
          </button>
          {box.photos.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); prev(); }} className="absolute left-4 p-2 text-white/80 hover:text-white" aria-label={tg("prev")}>
              <ChevronLeft className="h-8 w-8" />
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cldLarge(box.photos[box.i], 1280)} alt={tg("workAlt", { n: box.i + 1 })} className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain" onClick={(e) => e.stopPropagation()} />
          {box.photos.length > 1 && (
            <button onClick={(e) => { e.stopPropagation(); next(); }} className="absolute right-4 p-2 text-white/80 hover:text-white" aria-label={tg("next")}>
              <ChevronRight className="h-8 w-8" />
            </button>
          )}
          {box.photos.length > 1 && <span className="absolute bottom-4 text-sm text-white/70">{box.i + 1} / {box.photos.length}</span>}
        </div>
      )}
    </div>
  );
}
