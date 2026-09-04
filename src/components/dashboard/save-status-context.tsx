"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Estado de guardado compartido de los editores del panel.
//
// Los editores REPORTAN aquí si están guardando, si acaban de guardar y si tienen
// cambios pendientes. Ya no se pinta ningún aviso flotante: la respuesta la da el
// propio botón de guardar (gira mientras escribe y se apaga al terminar). El
// contexto se mantiene porque el panel lo consulta para otras decisiones.

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

// Editors call this to surface autosave state in the panel-level status row.
// Resets to idle on unmount (tab switch) so a stale "Guardado" never lingers on another tab.
export function useReportSaveStatus(saving: boolean, saved: boolean, dirty = false) {
  const set = useContext(SetterCtx);
  useEffect(() => {
    set?.({ saving, saved, dirty });
  }, [set, saving, saved, dirty]);
  useEffect(() => () => set?.(IDLE), [set]);
}

