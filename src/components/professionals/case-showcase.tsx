"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Images, X, ChevronLeft, ChevronRight } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";
import { cldThumb, cldLarge } from "@/lib/cloudinary";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import { cn } from "@/lib/utils";

export type ShowcaseCase = {
  id: string;
  profession: string;
  title?: string;
  description?: string;
  recipient?: string;
  date?: string;
  photos: string[];
};

// Client-facing "Casos de éxito" showcase (the public profile). A profession filter
// ("Todos" + per-profession counts) over one-per-row vertical case cards: cover photo + N-fotos
// badge + profession tag + title + short description + recipient/date.
// Tapping a card opens a spacious CASE-DETAIL modal (sprint 527): the full info (service ·
// recipient · date · description) beside a LARGER, browsable photo viewer — an overlay in
// the same page, not a separate route.
export function CaseShowcase({
  cases,
  professions,
  initialCaseId,
}: {
  cases: ShowcaseCase[];
  /** The pro's professions, in display order — used to order + label the filter chips. */
  professions: string[];
  initialCaseId?: string | null;
}) {
  const locale = useLocale();
  const t = useTranslations("profile");
  const tg = useTranslations("gallery");
  // Filter is always a real profession (no "Todas") — defaults to the first with cases.
  const [active, setActive] = useState<string>(professions[0] ?? "");
  // The opened case (detail modal) + the current photo index — null when closed.
  const [detail, setDetail] = useState<ShowcaseCase | null>(null);
  const [pi, setPi] = useState(0);

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
  // Keep the active filter valid (no "Todas") — fall back to the first profession with cases.
  const showFilter = distinctProfs.length > 1;
  const countFor = (p: string) => cases.filter((c) => c.profession === p).length;
  const selectedActive = distinctProfs.includes(active) ? active : distinctProfs[0] ?? "";
  const shown = cases.filter((c) => c.profession === selectedActive);

  useEffect(() => {
    if (!initialCaseId || detail) return;
    const target = cases.find((item) => item.id === initialCaseId);
    if (!target) return;
    setActive(target.profession);
    setDetail(target);
    setPi(0);
  }, [cases, detail, initialCaseId]);

  // ── Detail modal nav (Esc / ← / →) ──
  function openCase(c: ShowcaseCase) { setDetail(c); setPi(0); }
  const close = useCallback(() => setDetail(null), []);
  const prev = useCallback(() => { if (detail) setPi((i) => (i - 1 + detail.photos.length) % detail.photos.length); }, [detail]);
  const next = useCallback(() => { if (detail) setPi((i) => (i + 1) % detail.photos.length); }, [detail]);
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, close, prev, next]);

  useEffect(() => {
    if (!detail) return;
    const scrollY = window.scrollY;
    const previousOverflow = document.body.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const previousOverscroll = document.body.style.overscrollBehavior;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overscrollBehavior = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      document.body.style.overscrollBehavior = previousOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, [detail]);

  return (
    <div className="flex flex-col gap-5">
      {showFilter && (
        <StatusFilterTabs
          tabs={distinctProfs.map((p) => ({ id: p }))}
          value={selectedActive}
          onChange={setActive}
          labelFor={profLabel}
          counts={Object.fromEntries(distinctProfs.map((p) => [p, countFor(p)]))}
          mobileLayout="wrap"
        />
      )}

      <div className="grid grid-cols-1 gap-5">
        {shown.map((c) => {
          return (
            <div
              key={c.id}
              onClick={() => openCase(c)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCase(c); } }}
              className="group relative cursor-pointer overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="p-5">
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row">
                <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#0089bb]">{profLabel(c.profession)}</p>
                {c.title && <p className="mt-1 text-[18px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere]">{c.title}</p>}
                {c.description && <p className="mt-1.5 line-clamp-4 text-[14px] leading-relaxed text-[#6b7280] [overflow-wrap:anywhere]">{c.description}</p>}
                {(c.recipient || c.date) && (
                  <p className="mt-2.5 flex flex-wrap items-baseline gap-x-1.5 text-[12px] [overflow-wrap:anywhere]">
                    {c.recipient && <span className="font-medium text-[#374151]">{c.recipient}</span>}
                    {c.recipient && c.date && <span className="text-[#d1d5db]">·</span>}
                    {c.date && <span className="text-[#9ca3af]">{c.date}</span>}
                  </p>
                )}
                </div>
                {c.photos.length > 0 && (
                  <div className="flex shrink-0 -space-x-3 pt-1 sm:self-auto">
                    {c.photos.slice(0, 3).map((url, idx) => (
                      <div
                        key={`${c.id}-${url}`}
                        className="relative h-14 w-14 overflow-hidden rounded-xl border-2 border-white bg-white p-1 shadow-sm sm:h-16 sm:w-16"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={cldThumb(url, 220)} alt={c.title ?? ""} loading="lazy" className="h-full w-full object-contain" />
                        {idx === 2 && c.photos.length > 3 && (
                          <span className="absolute inset-0 grid place-items-center bg-black/45 text-xs font-bold text-white">+{c.photos.length - 3}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                </div>
                {c.photos.length > 1 && (
                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#f3f4f6] pt-3">
                    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-[#f3f4f6] px-2 py-1 text-[11px] font-semibold text-[#6b7280]">
                      <Images className="h-3 w-3" /> {t("casosPhotos", { count: c.photos.length })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Case DETAIL modal (overlay, same page) — large browsable photos + full info ── */}
      {detail && (() => {
        const c = detail;
        const photos = c.photos;
        const cur = photos[pi] ?? photos[0];
        return (
          <div className="fixed inset-0 z-[300] flex touch-none items-end justify-center overflow-hidden bg-[#08111f]/90 p-0 backdrop-blur-[3px] sm:items-center sm:p-6" onClick={close}>
            <div
              className="relative flex h-[100dvh] max-h-[100dvh] w-full touch-auto flex-col overflow-hidden bg-[#0f172a] shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-5xl sm:rounded-2xl sm:bg-white sm:flex-row"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label={c.title || profLabel(c.profession)}
            >
              <button
                onClick={close}
                aria-label={tg("close")}
                className="absolute right-4 top-[max(env(safe-area-inset-top),0.875rem)] z-30 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-black/60 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/75 sm:right-3 sm:top-3 sm:h-9 sm:w-9 sm:bg-white/90 sm:text-[#374151] sm:hover:bg-white"
              >
                <X className="h-5 w-5" />
              </button>

              {/* PHOTO viewer — larger, browsable (arrows + thumbnails). */}
              {cur && (
                <div className="relative flex h-[58dvh] min-h-[320px] shrink-0 items-center justify-center overflow-hidden bg-[#0f172a] pt-[env(safe-area-inset-top)] sm:h-auto sm:min-h-[620px] sm:w-[62%] sm:pt-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cldLarge(cur, 900)} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/15 to-[#0f172a]/80" />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cldLarge(cur, 1280)} alt={tg("workAlt", { n: pi + 1 })} className="relative z-10 h-full w-full object-contain" />
                  {photos.length > 1 && (
                    <>
                      <button onClick={prev} aria-label={tg("prev")} className="absolute left-3 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#111827]/80 text-white shadow-lg backdrop-blur transition-colors hover:bg-[#111827] sm:left-4 sm:h-11 sm:w-11">
                        <ChevronLeft className="h-6 w-6 sm:h-7 sm:w-7" />
                      </button>
                      <button onClick={next} aria-label={tg("next")} className="absolute right-3 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-[#111827]/80 text-white shadow-lg backdrop-blur transition-colors hover:bg-[#111827] sm:right-4 sm:h-11 sm:w-11">
                        <ChevronRight className="h-6 w-6 sm:h-7 sm:w-7" />
                      </button>
                      <span className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/25 bg-[#111827]/85 px-3 py-1.5 text-[12px] font-bold text-white shadow-lg backdrop-blur sm:bottom-3 sm:px-2.5 sm:py-1 sm:text-[11px]">
                        {pi + 1} / {photos.length}
                      </span>
                    </>
                  )}
                </div>
              )}

              {/* INFO — the service, recipient, date + full description, with room to breathe. */}
              <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden bg-white shadow-[0_-18px_40px_rgba(15,23,42,0.22)] sm:mt-0 sm:rounded-none sm:shadow-none">
                <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-[#dbe5ee] sm:hidden" />
                <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <span className="inline-flex min-w-0 max-w-full rounded-full bg-[#EBF5FB] px-3 py-1.5 text-[12px] font-bold text-[#0089bb]">
                      <span className="truncate">{profLabel(c.profession)}</span>
                    </span>
                    {photos.length > 1 && (
                      <span className="shrink-0 rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[12px] font-bold text-[#64748b] sm:hidden">
                        {pi + 1}/{photos.length}
                      </span>
                    )}
                  </div>
                  {c.title && <h3 className="text-[21px] font-bold leading-snug text-[#162543] [overflow-wrap:anywhere] sm:text-xl">{c.title}</h3>}
                  {(c.recipient || c.date) && (
                    <p className="flex flex-wrap items-baseline gap-x-1.5 text-[13px] [overflow-wrap:anywhere]">
                      {c.recipient && <span className="font-medium text-[#374151]">{c.recipient}</span>}
                      {c.recipient && c.date && <span className="text-[#d1d5db]">·</span>}
                      {c.date && <span className="text-[#9ca3af]">{c.date}</span>}
                    </p>
                  )}
                  {c.description && <p className="whitespace-pre-line text-[14px] leading-relaxed text-[#4b5563] [overflow-wrap:anywhere]">{c.description}</p>}
                  {photos.length > 1 && (
                    <div className="-mx-5 mt-1 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0">
                      {photos.map((p, idx) => (
                        <button
                          key={idx}
                          onClick={() => setPi(idx)}
                          aria-label={tg("workAlt", { n: idx + 1 })}
                          className={cn(
                            "h-16 w-20 shrink-0 overflow-hidden rounded-xl bg-transparent p-0 transition-opacity sm:w-auto",
                            idx === pi ? "opacity-100" : "opacity-55 hover:opacity-85"
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={cldThumb(p, 220)}
                            alt=""
                            className={cn(
                              "h-full w-full rounded-xl object-cover transition-shadow",
                              idx === pi ? "shadow-[0_0_0_2px_rgba(15,23,42,0.18),0_8px_18px_rgba(15,23,42,0.16)]" : "shadow-none"
                            )}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
