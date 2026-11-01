"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Expand, Minimize2 } from "lucide-react";

const VISUAL_GUIDES = new Set(["completionGuide", "services", "workplacesGuide", "clientProjects", "offersPanel"]);
export function hasVisualGuide(id: string) { return VISUAL_GUIDES.has(id); }

export function GuideVisualWalkthrough({ id, title, steps }: { id: string; title: string; steps: string[] }) {
  const locale = useLocale() === "en" ? "en" : "es";
  const t = useTranslations("proPanel.guides");
  const [step, setStep] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const src = `/panel-guides/${locale}-${id}-${step + 1}.jpg`;
  const alt = t("captureAlt", { step: step + 1, text: steps[step] });
  return <div className="mt-4 space-y-3" data-guide-visual={id} aria-label={title}>
    <div className="flex items-center justify-between gap-3"><p className="text-sm font-bold text-[#162543]">{t("visualStep", { step: step + 1, total: steps.length })}</p><span className="text-xs text-[#68778d]">{t("exampleNotice")}</span></div>
    <button type="button" onClick={() => setExpanded(!expanded)} aria-pressed={expanded} aria-label={t(expanded ? "reduceCapture" : "enlargeCapture")} className={`relative mx-auto block w-full overflow-hidden rounded-2xl border border-[#dce8ef] bg-[#f7fafc] p-2 ${expanded ? "max-w-[520px]" : "max-w-[320px]"}`}>
      {/* Real UI capture, generated locally with synthetic data. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={390} height={480} loading="lazy" className={`h-auto w-full object-contain ${expanded ? "" : "max-h-[420px]"}`} />
      <span className="absolute bottom-3 right-3 rounded-full border border-[#dce8ef] bg-white p-2 text-[#0089bb]">{expanded ? <Minimize2 className="h-4 w-4" aria-hidden /> : <Expand className="h-4 w-4" aria-hidden />}</span>
    </button>
    <p className="text-sm leading-relaxed text-[#374151]" aria-live="polite">{steps[step]}</p>
    <div className="flex items-center justify-between gap-3">
      <button type="button" disabled={step === 0} onClick={() => setStep(step - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-[#dce8ef] px-3 text-sm font-semibold text-[#526277] disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden />{t("previousStep")}</button>
      <button type="button" disabled={step === steps.length - 1} onClick={() => setStep(step + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-[#009FD9] px-4 text-sm font-semibold text-white disabled:opacity-40">{t("nextStep")}<ChevronRight className="h-4 w-4" aria-hidden /></button>
    </div>
    <details className="rounded-xl border border-[#e5e7eb] p-3"><summary className="cursor-pointer text-sm font-semibold text-[#526277]">{t("allSteps")}</summary><ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[#374151]">{steps.map((text,i) => <li key={i}>{text}</li>)}</ol></details>

  </div>;
}
