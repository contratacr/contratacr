"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Las fotos ya resueltas viven fuera del componente y en el navegador: al volver
// a Notificaciones las filas se pintan con la foto desde el primer cuadro, en vez
// de mostrar el icono y cambiarlo un segundo después. Solo se consulta lo nuevo.
const CLAVE_ALMACEN = "ccr:notification-actor-photos";
const cacheFotos = new Map<string, string>();
let cargadoDelAlmacen = false;

function leerAlmacen(): void {
  if (cargadoDelAlmacen || typeof window === "undefined") return;
  cargadoDelAlmacen = true;
  try {
    const crudo = window.localStorage.getItem(CLAVE_ALMACEN);
    if (!crudo) return;
    for (const [id, url] of Object.entries(JSON.parse(crudo) as Record<string, string>)) {
      if (typeof url === "string") cacheFotos.set(id, url);
    }
  } catch {
    // El caché es una comodidad: sin él solo se vuelve a consultar.
  }
}

function guardarAlmacen(): void {
  if (typeof window === "undefined") return;
  try {
    // Se guardan las últimas 200: son ids cortos y urls, no crece sin control.
    const recientes = [...cacheFotos.entries()].slice(-200);
    window.localStorage.setItem(CLAVE_ALMACEN, JSON.stringify(Object.fromEntries(recientes)));
  } catch {
    // Sin espacio de almacenamiento, el caché en memoria sigue sirviendo.
  }
}

// La notificación no guarda al autor, pero deja rastros para llegar a él: el
// profesional de una publicación, la propuesta que apunta a su profesional, o
// el perfil de quien empezó a seguirte. Se resuelve por lotes, nunca por fila.
type ConDatos = { data?: Record<string, unknown> | null };

export function useActorPhotos(items: ConDatos[]) {
  leerAlmacen();
  const [fotos, setFotos] = useState<Record<string, string>>(() => Object.fromEntries(cacheFotos));

  useEffect(() => {
    const idsProfesional = new Set<string>();
    const idsPropuesta = new Set<string>();
    const idsPerfil = new Set<string>();
    for (const item of items) {
      const datos = (item.data ?? {}) as Record<string, unknown>;
      // Lo ya conocido no se vuelve a pedir.
      if (typeof datos.professional_id === "string" && !cacheFotos.has(datos.professional_id)) idsProfesional.add(datos.professional_id);
      if (typeof datos.proposal_id === "string" && !cacheFotos.has(datos.proposal_id)) idsPropuesta.add(datos.proposal_id);
      if (typeof datos.follower_id === "string" && !cacheFotos.has(datos.follower_id)) idsPerfil.add(datos.follower_id);
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
      for (const [id, url] of Object.entries(siguiente)) cacheFotos.set(id, url);
      guardarAlmacen();
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
