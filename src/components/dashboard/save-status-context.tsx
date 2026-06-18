"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SaveStatus } from "@/components/dashboard/save-status";
import { cn } from "@/lib/utils";

// ── Inline-with-title autosave status ────────────────────────────────────────
// The autosave "Guardado/Guardando…" indicator must live ON THE SECTION TITLE LINE
// (right of the heading), NOT in the content flow — otherwise toggling it null↔shown
// pushed the content down and back up (a layout jump). Editors REPORT their save
// state up through this context; the dashboard's section-title row renders it via
// <HeaderSaveStatus/>. The title line always exists, so the content never moves.
//
// Setter + value are split into two contexts so an editor that only reports never
// re-renders when the value changes (and the report effect's deps stay stable —
// React's useState setter is referentially stable).

type Status = { saving: boolean; saved: boolean; dirty: boolean };
const IDLE: Status = { saving: false, saved: false, dirty: false };

const SetterCtx = createContext<((s: Status) => void) | null>(null);
const ValueCtx = createContext<Status>(IDLE);

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(IDLE);
  return (
    <SetterCtx.Provider value={setStatus}>
      <ValueCtx.Provider value={status}>{children}</ValueCtx.Provider>
    </SetterCtx.Provider>
  );
}

// An editor calls this to surface its autosave state in the section title. Resets to
// idle on unmount (tab switch) so a stale "Guardado" never lingers on another tab.
export function useReportSaveStatus(saving: boolean, saved: boolean, dirty = false) {
  const set = useContext(SetterCtx);
  useEffect(() => {
    set?.({ saving, saved, dirty });
  }, [set, saving, saved, dirty]);
  useEffect(() => () => set?.(IDLE), [set]);
}

// Rendered as a FIXED floating pill (bottom-right of the viewport) so the autosave
// state stays visible no matter how far the pro scrolls through a long profile. It's
// OUT of the document flow (can't push/reflow content) and only appears while there's
// something to report (saving / just-saved / unsaved) — idle shows nothing.
export function HeaderSaveStatus({ className }: { className?: string }) {
  const s = useContext(ValueCtx);
  if (!s.saving && !s.saved && !s.dirty) return null;
  return (
    <div className={cn("pointer-events-none fixed bottom-4 right-4 z-50 rounded-full border border-[#e5e7eb] bg-white/95 px-3.5 py-2 shadow-lg backdrop-blur", className)}>
      <SaveStatus saving={s.saving} saved={s.saved} dirty={s.dirty} />
    </div>
  );
}
