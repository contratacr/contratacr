"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * El acuse de lo que se guarda solo.
 *
 * REGLA DEL PANEL: un FORMULARIO se guarda con su botón («Guardar cambios», que
 * gira mientras escribe). Una ACCIÓN SUELTA de una lista —encender o apagar un
 * servicio, hacerlo principal, eliminar un caso— se guarda en el momento: no hay
 * borrador que revisar, y con un botón la gente apagaría algo, saldría y lo
 * perdería. A cambio, esa acción tiene que CONFIRMARSE a la vista.
 *
 * Antes la confirmación era una línea gris de 13 px al FINAL de la lista: con
 * seis servicios, tocar el interruptor del primero la pintaba dos pantallas más
 * abajo (medido: y=1853 en una pantalla de 900). Se guardaba bien y nadie lo
 * veía. Ahora es una pastilla FIJA al pie de la pantalla, igual en todas las
 * secciones, sin importar dónde esté el scroll.
 *
 * La posición va en `style` y no en clases: es geometría crítica y no puede
 * depender de que el CSS de utilidades haya llegado.
 */
export function AutoSaveHint({ saving, saved }: { saving: boolean; saved: boolean }) {
  const t = useTranslations("common");
  if (!saving && !saved) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-aviso-guardado={saving ? "guardando" : "guardado"}
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        // Por encima de la franja de acciones del teléfono y de la barra de la app
        // (las dos variables las pone layout.tsx y valen 0 cuando no hay nada).
        bottom: "calc(env(safe-area-inset-bottom) + var(--ccr-aviso-franja, 0px) + var(--ccr-aviso-barra-app, 0px) + 20px)",
        zIndex: 60,
        pointerEvents: "none",
      }}
      className="flex items-center gap-2 rounded-full bg-[#162543] px-4 py-2.5 text-[14px] font-bold text-white shadow-[0_12px_32px_-10px_rgba(15,23,42,0.55)]"
    >
      {saving
        ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
        : <Check className="h-4 w-4 shrink-0 text-[#4ade80]" strokeWidth={3} aria-hidden />}
      {saving ? t("savingShort") : t("savedShort")}
    </div>
  );
}

/**
 * Para las acciones sueltas que no llevan su propio estado de guardado: envuelve
 * la llamada y devuelve lo que `AutoSaveHint` necesita. `correr` espera un
 * booleano —¿se guardó?—; con `false` no se dice «Guardado».
 *
 *   const aviso = useAvisoDeGuardado();
 *   await aviso.correr(async () => (await fetch(...)).ok);
 *   ...
 *   <AutoSaveHint {...aviso.estado} />
 */
export function useAvisoDeGuardado(msVisible = 2200) {
  const [estado, setEstado] = useState({ saving: false, saved: false });
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const correr = useCallback(async (accion: () => Promise<boolean>) => {
    if (reloj.current) clearTimeout(reloj.current);
    setEstado({ saving: true, saved: false });
    let ok = false;
    try { ok = await accion(); } catch { ok = false; }
    setEstado({ saving: false, saved: ok });
    if (ok) reloj.current = setTimeout(() => setEstado({ saving: false, saved: false }), msVisible);
    return ok;
  }, [msVisible]);
  return { estado, correr };
}
