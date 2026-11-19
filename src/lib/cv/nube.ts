import { createClient } from "@/lib/supabase/client";

/**
 * LOS CV Y CARTAS, GUARDADOS EN LA CUENTA (19-nov-2026). Antes vivían solo en
 * el navegador de un dispositivo: si se cambiaba de teléfono o se borraba el
 * app, se perdían. La tabla `cv_documents` es solo del dueño (RLS); el
 * navegador sigue guardando una copia para trabajar sin conexión.
 *
 * Si la tabla todavía no existe o no hay conexión, todo sigue funcionando en
 * el dispositivo y se avisa que no se guardó en la cuenta.
 */

export type FilaNube = { id: string; tipo: "cv" | "carta"; titulo: string; datos: unknown; actualizado: number };

const TABLA = "cv_documents";
export const esUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

function cliente() {
  try { return createClient(); } catch { return null; }
}

/** Todo lo de la cuenta, o null si no se pudo leer (sin conexión, sin tabla). */
export async function leerDeLaNube(): Promise<FilaNube[] | null> {
  const supabase = cliente();
  if (!supabase) return null;
  const { data, error } = await supabase.from(TABLA).select("id, tipo, titulo, datos, updated_at").order("updated_at", { ascending: false }).limit(40);
  if (error || !Array.isArray(data)) return null;
  return data
    .filter((f) => f && (f.tipo === "cv" || f.tipo === "carta"))
    .map((f) => ({ id: String(f.id), tipo: f.tipo as "cv" | "carta", titulo: String(f.titulo ?? ""), datos: f.datos, actualizado: Date.parse(String(f.updated_at)) || 0 }));
}

/** Crea o actualiza varios a la vez. Devuelve false si no se pudo. */
export async function guardarEnLaNube(filas: { id: string; tipo: "cv" | "carta"; titulo: string; datos: unknown }[]): Promise<boolean> {
  if (!filas.length) return true;
  const supabase = cliente();
  if (!supabase) return false;
  const { error } = await supabase.from(TABLA).upsert(filas.map((f) => ({ id: f.id, tipo: f.tipo, titulo: f.titulo.slice(0, 120), datos: f.datos })), { onConflict: "id" });
  return !error;
}

export async function borrarDeLaNube(id: string): Promise<boolean> {
  const supabase = cliente();
  if (!supabase) return false;
  const { error } = await supabase.from(TABLA).delete().eq("id", id);
  return !error;
}
