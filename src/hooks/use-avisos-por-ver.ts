"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { pedirTotalSinLeer, suscribirseAAvisos } from "@/lib/notifications-live";

// Cuántos avisos sin leer tiene la persona, para el globo del icono de
// Notificaciones del menú de abajo. Se recuerda entre pantallas (el menú vive
// en el armazón y no se desmonta, pero así el número no arranca en cero tras
// recargar) y se vuelve a pedir con cada aviso nuevo o cambio.
let ultimo: { userId: string; total: number } | null = null;

// En la pantalla de Notificaciones la barra de abajo no está montada, así que
// su cambio de «todas leídas» no le llegaba: al salir, la barra volvía con el
// número viejo medio segundo y luego lo quitaba. Este oyente vive aunque la
// barra no, y deja la memoria en cero (o la olvida) para que vuelva limpia.
if (typeof window !== "undefined") {
  window.addEventListener("notificationsChanged", (event) => {
    const detalle = (event as CustomEvent<{ sinLeer?: number; userId?: string }>).detail;
    if (typeof detalle?.sinLeer === "number" && detalle.userId) ultimo = { userId: detalle.userId, total: detalle.sinLeer };
    else ultimo = null;
  });
}

/** Lo último que se supo del total sin leer de esta persona, o null. */
export function avisosRecordados(userId: string | undefined): number | null {
  return userId && ultimo?.userId === userId ? ultimo.total : null;
}

export function recordarAvisos(userId: string, total: number) {
  ultimo = { userId, total };
}

export function useAvisosPorVer(activo: boolean): number {
  const { user } = useAuth();
  const [total, setTotal] = useState(() => (user && ultimo?.userId === user.id ? ultimo.total : 0));

  useEffect(() => {
    if (!activo || !user) return;
    const userId = user.id;
    let vivo = true;
    const pedir = () => {
      void pedirTotalSinLeer(userId).then((n) => {
        if (!vivo || n === null) return;
        ultimo = { userId, total: n };
        setTotal(n);
      });
    };
    pedir();
    const quitar = suscribirseAAvisos(userId, pedir);
    window.addEventListener("notificationsChanged", pedir);
    return () => {
      vivo = false;
      quitar();
      window.removeEventListener("notificationsChanged", pedir);
    };
  }, [activo, user]);

  return activo && user ? total : 0;
}
