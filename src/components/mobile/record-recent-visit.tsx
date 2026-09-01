"use client";

import { useEffect } from "react";
import { recordRecentVisit, type RecentVisit, type RecentVisitSurface } from "@/lib/recent-visits";

// Deja constancia de lo que se abrió para que el buscador lo ofrezca de vuelta.
export function RecordRecentVisit({ surface, visita }: { surface: RecentVisitSurface; visita: RecentVisit }) {
  const { id, titulo, subtitulo, imagen, iniciales, href } = visita;

  useEffect(() => {
    recordRecentVisit(surface, { id, titulo, subtitulo, imagen, iniciales, href });
  }, [href, id, imagen, iniciales, subtitulo, surface, titulo]);

  return null;
}
