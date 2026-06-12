"use client";

import { CheckCircle2, ChevronRight, Sparkles, ShieldCheck } from "lucide-react";
import { anyHealthCategory } from "@/lib/data/categories";

// Context-aware profile-completion checklist. Goal: minimal signup, then guide
// the pro to finish. The PERCENTAGE counts only content the pro fully controls
// (so completing the list always reaches 100%); identity verification is
// approval-gated (and impossible to auto-pass for non-padrón IDs), so it's shown
// as a separate recommended action and never blocks 100%. Only counts fields that
// APPLY (aseguradoras only for health; Spanish-only and "I have none" are never
// penalized). Each item is benefit-framed and links to the tab that completes it.

type ProRecord = Record<string, unknown>;

export type CompletionItem = {
  key: string;
  label: string;
  benefit: string;
  done: boolean;
  tab: string;
};

function hasLen(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

export function computeCompletion(pro: ProRecord): {
  percent: number;
  items: CompletionItem[];
  verified: boolean;
} {
  const profiles = (pro.profiles ?? {}) as { avatar_url?: string | null };
  const professions = (pro.professions as string[]) ?? [];

  // Location is "done" as soon as ANY location signal exists — independent of how
  // service_type is stored, so it never gets stuck for a pro who clearly set a zone.
  const hasLocation =
    hasLen(pro.workplaces) ||
    hasLen(pro.coverage_areas) ||
    hasLen(pro.coverage_provincias) ||
    !!pro.coverage_country ||
    !!pro.provincia_id ||
    !!pro.canton_id;

  const items: CompletionItem[] = [
    {
      key: "photo",
      label: "Agrega tu foto de perfil",
      benefit: "Los perfiles con foto generan más confianza y reciben más solicitudes.",
      done: !!profiles.avatar_url,
      tab: "profile",
    },
    {
      key: "bio",
      label: "Escribe una descripción",
      benefit: "Cuéntales a los clientes quién eres y por qué elegirte.",
      done: typeof pro.bio === "string" && pro.bio.trim().length >= 30,
      tab: "profile",
    },
    {
      key: "services",
      label: "Agrega al menos un servicio",
      benefit: "Los clientes buscan por servicio: sin servicios casi no apareces.",
      done: hasLen(pro.services),
      tab: "services",
    },
    {
      key: "location",
      label: "Indica tu ubicación o cobertura",
      benefit: "Así te encuentran los clientes de tu zona.",
      done: hasLocation,
      tab: "availability",
    },
    {
      key: "whatsapp",
      label: "Confirma tu número de WhatsApp",
      benefit: "Es la vía principal por la que los clientes te contactan.",
      done: typeof pro.whatsapp === "string" && pro.whatsapp.trim().length > 0,
      tab: "profile",
    },
  ];

  // Aseguradoras apply ONLY to health pros; for everyone else it doesn't exist,
  // so it's never counted as "missing".
  if (anyHealthCategory(professions)) {
    items.push({
      key: "insurers",
      label: "Indica tus aseguradoras",
      benefit: "Los pacientes filtran por su seguro: aparecer ahí te trae más citas.",
      done: hasLen(pro.insurance_networks),
      tab: "profile",
    });
  }

  const done = items.filter((i) => i.done).length;
  const percent = Math.round((done / items.length) * 100);
  return { percent, items, verified: pro.verification_status === "verified" };
}

export function ProfileCompletion({ pro, onGo }: { pro: ProRecord; onGo: (tab: string) => void }) {
  const { percent, items, verified } = computeCompletion(pro);
  const missing = items.filter((i) => !i.done);
  const doneItems = items.filter((i) => i.done);
  const complete = percent === 100;

  // Fully done AND verified → nothing to nudge; keep the dashboard clean.
  if (complete && verified) return null;

  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 sm:p-6 mb-6">
      {/* Header: title + linear progress */}
      <div className="flex items-center justify-between gap-4 mb-1">
        <h3 className="text-base font-semibold text-[#111827] flex items-center gap-1.5">
          {complete
            ? <><Sparkles className="h-4 w-4 text-[#16a34a]" /> ¡Tu perfil está completo!</>
            : "Completa tu perfil"}
        </h3>
        <span className={cnPct(complete)}>{percent}%</span>
      </div>
      <p className="text-sm text-[#6b7280] mb-4">
        {complete
          ? "Excelente. Solo te falta la insignia de identidad verificada."
          : "Un perfil completo genera más confianza y te trae más clientes."}
      </p>

      {/* Linear progress bar */}
      <div className="h-2 w-full rounded-full bg-[#f3f4f6] overflow-hidden mb-5">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${percent}%`, backgroundColor: complete ? "#16a34a" : "#009FD9" }}
        />
      </div>

      {/* Pending items — flat rows (no nested boxes), separated by light hover only. */}
      {missing.length > 0 && (
        <ul className="flex flex-col -mx-2 mb-1">
          {missing.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onGo(item.tab)}
                className="group flex w-full items-start gap-3 rounded-xl hover:bg-[#f9fafb] px-2 py-2.5 text-left transition-colors"
              >
                <span className="mt-0.5 h-4 w-4 rounded-full border-2 border-[#cbd5e1] shrink-0 group-hover:border-[#009FD9] transition-colors" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-[#111827]">{item.label}</span>
                  <span className="block text-xs text-[#6b7280] mt-0.5">{item.benefit}</span>
                </span>
                <ChevronRight className="h-4 w-4 text-[#9ca3af] group-hover:text-[#009FD9] shrink-0 mt-0.5 transition-colors" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Verification — a separate recommended action, not part of the %. */}
      {!verified && (
        <button
          type="button"
          onClick={() => onGo("verificacion")}
          className="group mt-2 flex w-full items-center gap-3 rounded-xl bg-[#EBF5FB] hover:bg-[#dcefff] px-3 py-3 text-left transition-colors"
        >
          <ShieldCheck className="h-5 w-5 text-[#009FD9] shrink-0" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-[#0077a8]">Verifica tu identidad</span>
            <span className="block text-xs text-[#0077a8]/80 mt-0.5">La insignia de identidad verificada hace que más clientes te elijan.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-[#0077a8] shrink-0 transition-transform group-hover:translate-x-0.5" />
        </button>
      )}

      {/* Done items — compact reassurance. */}
      {doneItems.length > 0 && !complete && (
        <div className="mt-4 pt-4 border-t border-[#f3f4f6] flex flex-wrap gap-x-3 gap-y-1.5">
          {doneItems.map((i) => (
            <span key={i.key} className="inline-flex items-center gap-1 text-[11px] text-[#16a34a]">
              <CheckCircle2 className="h-3.5 w-3.5" /> {i.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function cnPct(complete: boolean): string {
  return `text-lg font-bold ${complete ? "text-[#16a34a]" : "text-[#009FD9]"}`;
}
