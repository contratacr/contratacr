"use client";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { TOOLS_ROW, TOOLS_ROW_ICON, TOOLS_TITLE, toolsCatalogFor, type ToolsGroupId } from "@/lib/pro/tools-catalog";

/**
 * «Herramientas» inside «Mi panel» while Pro is on (owner, 2026-11-27): the five groups of the public page, with the
 * panel's own rows. A group is ?tab=tools&grupo=<id>; on phones its title is the bar's «← <group>» (no second header
 * here), on desktop the section keeps an in-page back link and heading. Pro tools open the Pro space; the CV and the
 * letter open their panel sections.
 */
export function HerramientasCatalogo({ grupo, esProfesional, alAbrirGrupo, alAbrirSeccion, alVolver }: {
  grupo: ToolsGroupId | null;
  // A professional keeps «Cotizaciones» in the panel (its own section, free like production), not in the Pro space.
  esProfesional: boolean;
  alAbrirGrupo: (id: ToolsGroupId) => void;
  alAbrirSeccion: (tab: "cv" | "carta" | "quotes") => void;
  alVolver: () => void;
}) {
  const en = useLocale() === "en";
  // A client account never sees a tool that opens the Pro space (owner, 2026-11-27).
  const groups = toolsCatalogFor(en, esProfesional);
  const open = groups.find((g) => g.id === grupo) ?? null;
  if (open) {
    return (
      <section data-tools-group={open.id} data-tools-panel>
        <button type="button" onClick={alVolver} data-tools-back className="mb-3 hidden items-center gap-1.5 text-[15px] font-bold text-[#0083b0] lg:inline-flex">
          <ArrowLeft className="h-4 w-4" aria-hidden />{en ? TOOLS_TITLE.en : TOOLS_TITLE.es}
        </button>
        <h2 data-tools-group-heading className="mb-3 hidden text-[20px] font-extrabold text-[#162543] lg:block">{open.label}</h2>
        <ul className="space-y-2">
          {open.tools.map(({ key, label, href, icon: Icon, panelTab: seccion }) => {
            const panelTab = seccion ?? (key === "quotes" && esProfesional ? "quotes" as const : undefined);
            const contenido = <>
              <span className={TOOLS_ROW_ICON}><Icon aria-hidden /></span>
              <span className="min-w-0 flex-1 break-words">{label}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[#b6c4d4]" aria-hidden />
            </>;
            return (
              <li key={key}>
                {panelTab
                  ? <button type="button" data-tools-entry={key} onClick={() => alAbrirSeccion(panelTab)} className={TOOLS_ROW}>{contenido}</button>
                  : <Link href={href} prefetch={false} data-tools-entry={key} className={TOOLS_ROW}>{contenido}</Link>}
              </li>
            );
          })}
        </ul>
      </section>
    );
  }
  return (
    <ul className="space-y-2" data-tools-panel>
      {groups.map(({ id, label, icon: Icon }) => (
        <li key={id}>
          <button type="button" data-tools-group-tile={id} onClick={() => alAbrirGrupo(id)} className={TOOLS_ROW}>
            <span className={TOOLS_ROW_ICON}><Icon aria-hidden /></span>
            <span className="min-w-0 flex-1 break-words">{label}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[#b6c4d4]" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
