"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  APP_DATA_INVALIDATED_EVENT,
  APP_DATA_INVALIDATED_KEY,
  invalidateAppData,
  readLastAppDataInvalidation,
  type AppDataInvalidation,
} from "@/lib/app-data-invalidation";

const LEGACY_EVENTS = [
  "ccr:profile-updated",
  "ccr:identity-updated",
  "savedItemsChanged",
  "savedProsChanged",
  "professionalFollowsChanged",
] as const;

export function GlobalDataRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<number | null>(null);
  const lastSeenRef = useRef(0);
  const lastPathRef = useRef(pathname);
  const lastNavigationMutationRef = useRef(0);

  useEffect(() => {
    // Lo persistido ANTES de esta carga ya está servido fresco por el servidor:
    // solo cuentan las mutaciones que ocurran de aquí en adelante. Sin esto,
    // cualquier sello viejo ya guardado refrescaba la ruta entera en la
    // primera vuelta de visibilidad — el "refresh" fantasma al volver del
    // segundo plano.
    const initialMutation = readLastAppDataInvalidation()?.at ?? 0;
    lastSeenRef.current = Math.max(lastSeenRef.current, initialMutation);
    lastNavigationMutationRef.current = Math.max(lastNavigationMutationRef.current, initialMutation);
    const refresh = (invalidation?: AppDataInvalidation | null) => {
      // Sin constancia de una mutación pendiente no hay nada que refrescar.
      if (!invalidation?.at || invalidation.at <= lastSeenRef.current) return;
      lastSeenRef.current = invalidation.at;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => router.refresh(), 80);
    };
    const onInvalidated = (event: Event) => refresh((event as CustomEvent<AppDataInvalidation>).detail);
    const onStorage = (event: StorageEvent) => {
      if (event.key === APP_DATA_INVALIDATED_KEY) refresh(readLastAppDataInvalidation());
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh(readLastAppDataInvalidation());
    };
    const bridgeLegacyEvent = () => invalidateAppData("all");

    window.addEventListener(APP_DATA_INVALIDATED_EVENT, onInvalidated);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    LEGACY_EVENTS.forEach((name) => window.addEventListener(name, bridgeLegacyEvent));
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      window.removeEventListener(APP_DATA_INVALIDATED_EVENT, onInvalidated);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      LEGACY_EVENTS.forEach((name) => window.removeEventListener(name, bridgeLegacyEvent));
    };
  }, [router]);

  useEffect(() => {
    if (lastPathRef.current === pathname) return;
    lastPathRef.current = pathname;
    const invalidation = readLastAppDataInvalidation();
    // A mutation followed immediately by navigation may land on a prefetched RSC
    // payload. Refresh the new route once, silently, without changing scroll/state.
    // The event refresh may have run on the publishing screen already. It must
    // not consume the refresh owed to the destination of the next navigation.
    if (invalidation && invalidation.at > lastNavigationMutationRef.current) {
      lastNavigationMutationRef.current = invalidation.at;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      router.refresh();
    }
  }, [pathname, router]);

  return null;
}
