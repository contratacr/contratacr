"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { pedirTotalSinLeer, suscribirseAAvisos } from "@/lib/notifications-live";

// Cuántos avisos sin leer tiene la persona, para el globo del icono de
// Notificaciones del menú de abajo. Se recuerda entre pantallas (el menú vive
// en el armazón y no se desmonta, pero así el número no arranca en cero tras
// recargar) y se vuelve a pedir con cada aviso nuevo o cambio.
let ultimo: { userId: string; total: number } | null = null;

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
