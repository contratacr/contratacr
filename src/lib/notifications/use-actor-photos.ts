"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// La notificación no guarda al autor, pero deja rastros para llegar a él: el
// profesional de una publicación, la propuesta que apunta a su profesional, o
// el perfil de quien empezó a seguirte. Se resuelve por lotes, nunca por fila.
type ConDatos = { data?: Record<string, unknown> | null };

export function useActorPhotos(items: ConDatos[]) {
  const [fotos, setFotos] = useState<Record<string, string>>({});

  useEffect(() => {
    const idsProfesional = new Set<string>();
    const idsPropuesta = new Set<string>();
    const idsPerfil = new Set<string>();
    for (const item of items) {
      const datos = (item.data ?? {}) as Record<string, unknown>;
      if (typeof datos.professional_id === "string") idsProfesional.add(datos.professional_id);
      if (typeof datos.proposal_id === "string") idsPropuesta.add(datos.proposal_id);
      if (typeof datos.follower_id === "string") idsPerfil.add(datos.follower_id);
    }
    if (idsProfesional.size === 0 && idsPropuesta.size === 0 && idsPerfil.size === 0) return;

    let cancelado = false;
    void (async () => {
      const supabase = createClient();
      const profesionalPorPropuesta: Record<string, string> = {};
      if (idsPropuesta.size > 0) {
        const { data } = await supabase.from("proposals").select("id, professional_id").in("id", [...idsPropuesta]);
        for (const fila of (data ?? []) as Array<{ id: string; professional_id: string | null }>) {
          if (fila.professional_id) {
            profesionalPorPropuesta[fila.id] = fila.professional_id;
            idsProfesional.add(fila.professional_id);
          }
        }
      }
      const perfilPorProfesional: Record<string, string> = {};
      if (idsProfesional.size > 0) {
        const { data } = await supabase.from("professionals").select("id, profile_id").in("id", [...idsProfesional]);
        for (const fila of (data ?? []) as Array<{ id: string; profile_id: string | null }>) {
          if (fila.profile_id) {
            perfilPorProfesional[fila.id] = fila.profile_id;
            idsPerfil.add(fila.profile_id);
          }
        }
      }
      if (idsPerfil.size === 0 || cancelado) return;
      const { data: perfiles } = await supabase.from("profiles").select("id, avatar_url").in("id", [...idsPerfil]);
      if (cancelado) return;

      const fotoPorPerfil: Record<string, string> = {};
      for (const fila of (perfiles ?? []) as Array<{ id: string; avatar_url: string | null }>) {
        if (fila.avatar_url) fotoPorPerfil[fila.id] = fila.avatar_url;
      }
      const siguiente: Record<string, string> = { ...fotoPorPerfil };
      for (const [idProfesional, idPerfil] of Object.entries(perfilPorProfesional)) {
        if (fotoPorPerfil[idPerfil]) siguiente[idProfesional] = fotoPorPerfil[idPerfil];
      }
      for (const [idPropuesta, idProfesional] of Object.entries(profesionalPorPropuesta)) {
        if (siguiente[idProfesional]) siguiente[idPropuesta] = siguiente[idProfesional];
      }
      setFotos((previas) => ({ ...previas, ...siguiente }));
    })();

    return () => {
      cancelado = true;
    };
  }, [items]);

  return (item: ConDatos) => {
    const datos = (item.data ?? {}) as Record<string, unknown>;
    for (const clave of [datos.professional_id, datos.proposal_id, datos.follower_id]) {
      if (typeof clave === "string" && fotos[clave]) return fotos[clave];
    }
    return null;
  };
}
