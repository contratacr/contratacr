"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark } from "lucide-react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/** Los rótulos de guardar, en un solo lugar (los usan el botón y el hook). */
function etiquetasGuardado(locale: string, itemType: "offer" | "job" | "project") {
  return locale === "en"
    ? { save: "Save", short: "Save", saved: "Saved", remove: `Remove ${{ offer: "promotion", job: "job", project: "project" }[itemType]} from favorites` }
    : { save: "Guardar", short: "Guardar", saved: "Guardado", remove: `Quitar ${{ offer: "la promoción", job: "el empleo", project: "el proyecto" }[itemType]} de favoritos` };
}

export type SaveItemKind = "offer" | "job" | "project";

type SaveItemButtonProps = {
  itemType: SaveItemKind;
  itemId: string;
  snapshot: Record<string, unknown>;
  userId?: string | null;
  className?: string;
  withLabel?: boolean;
  /** Marcador en círculo, para la esquina de una tarjeta o sobre una foto. */
  bubble?: boolean;
  /** Ícono con rótulo, sin borde: la forma que usan las fichas. */
  sutil?: boolean;
  /**
   * El botón de la ficha en computadora, al lado de WhatsApp: 48 px de alto, a
   * todo su ancho y el rótulo a 16 px, exactamente como el de contactar.
   */
  grande?: boolean;
  showIcon?: boolean;
  loginRedirect?: string;
};

const EVENT_NAME = "savedItemsChanged";


/**
 * Guardar, sin botón: el estado y la acción sueltos, para poder ponerlos donde
 * haga falta —por ejemplo, como una opción más del «...» de una ficha—.
 * El botón de abajo usa exactamente esto.
 */
export function useGuardado({
  itemType,
  itemId,
  snapshot,
  userId,
  loginRedirect,
}: {
  itemType: SaveItemKind;
  itemId: string;
  snapshot: Record<string, unknown>;
  userId?: string | null;
  loginRedirect?: string;
}) {
  const locale = useLocale();
  const [saved, setSaved] = useState(false);
  const payload = useMemo(() => ({ ...snapshot, id: itemId, type: itemType }), [itemId, itemType, snapshot]);
  const labels = etiquetasGuardado(locale, itemType);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!userId) {
        setSaved(false);
        return;
      }
      const { data } = await createClient()
        .from("saved_items")
        .select("id")
        .eq("user_id", userId)
        .eq("item_type", itemType)
        .eq("item_id", itemId)
        .maybeSingle();
      if (mounted) setSaved(Boolean(data));
    }
    void load();
    const onChange = () => void load();
    window.addEventListener(EVENT_NAME, onChange);
    return () => {
      mounted = false;
      window.removeEventListener(EVENT_NAME, onChange);
    };
  }, [itemId, itemType, userId]);

  async function alternar() {
    if (!userId) {
      const redirect = encodeURIComponent(loginRedirect || window.location.pathname + window.location.search);
      window.location.assign(`/${locale}/login?redirect=${redirect}`);
      return;
    }
    const supabase = createClient();
    if (saved) {
      await supabase.from("saved_items").delete().eq("user_id", userId).eq("item_type", itemType).eq("item_id", itemId);
      setSaved(false);
    } else {
      await supabase.from("saved_items").upsert(
        { user_id: userId, item_type: itemType, item_id: itemId, snapshot: payload },
        { onConflict: "user_id,item_type,item_id" },
      );
      setSaved(true);
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }

  return { guardado: saved, alternar, etiqueta: saved ? labels.saved : labels.save, etiquetaLarga: saved ? labels.remove : labels.save };
}

export function SaveItemButton({
  itemType,
  itemId,
  snapshot,
  userId,
  className,
  withLabel = false,
  bubble = false,
  sutil = false,
  grande = false,
  showIcon,
  loginRedirect,
}: SaveItemButtonProps) {
  const locale = useLocale();
  const [saved, setSaved] = useState(false);
  const payload = useMemo(() => ({ ...snapshot, id: itemId, type: itemType }), [itemId, itemType, snapshot]);
  // El mismo rótulo que en el perfil: nombra la acción y dónde queda.
  // Un solo rótulo en todo el app: «Guardar» / «Guardado». Antes decía
  // «Guardar en favoritos» en unas pantallas y «Guardar» en otras, y la misma
  // acción parecía dos cosas distintas. El texto largo se queda solo en la
  // etiqueta para lectores de pantalla, donde sí ayuda.
  const labels = etiquetasGuardado(locale, itemType);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!userId) {
        setSaved(false);
        return;
      }
      const { data } = await createClient()
        .from("saved_items")
        .select("id")
        .eq("user_id", userId)
        .eq("item_type", itemType)
        .eq("item_id", itemId)
        .maybeSingle();
      if (mounted) setSaved(Boolean(data));
    }
    void load();
    const onChange = () => void load();
    window.addEventListener(EVENT_NAME, onChange);
    return () => {
      mounted = false;
      window.removeEventListener(EVENT_NAME, onChange);
    };
  }, [itemId, itemType, userId]);

  async function toggle(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if (!userId) {
      const redirect = encodeURIComponent(loginRedirect || window.location.pathname + window.location.search);
      window.location.assign(`/${locale}/login?redirect=${redirect}`);
      return;
    }

    const supabase = createClient();
    if (saved) {
      await supabase
        .from("saved_items")
        .delete()
        .eq("user_id", userId)
        .eq("item_type", itemType)
        .eq("item_id", itemId);
      setSaved(false);
    } else {
      await supabase.from("saved_items").upsert(
        {
          user_id: userId,
          item_type: itemType,
          item_id: itemId,
          snapshot: payload,
        },
        { onConflict: "user_id,item_type,item_id" },
      );
      setSaved(true);
    }
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={saved ? labels.remove : labels.save}
      aria-pressed={saved}
      className={cn(
        grande
          ? cn(
              "inline-flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border bg-white px-4 text-base font-semibold transition",
              saved ? "border-[#009FD9] text-[#0089bb] hover:bg-[#f2fbfe]" : "border-[#d7e1ea] text-[#162543] hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
            )
          : sutil
          ? cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-bold transition-colors duration-200",
              saved ? "text-[#0089bb] hover:bg-[#eaf7fc]" : "text-[#52627a] hover:bg-[#eef3f8] hover:text-[#162543]",
            )
          : bubble
          ? cn(
              "grid h-11 w-11 place-items-center rounded-full border bg-white transition-colors duration-200",
              saved
                ? "border-[#009FD9] bg-[#eaf7fc] text-[#0089bb]"
                : "border-[#d7e1ea] text-[#162543] hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
            )
          : withLabel
          ? cn(
              // Una sola línea, con el marcador delante. El ícono se había
              // quitado cuando el rótulo era «Guardar en favoritos» y se partía
              // en dos renglones; con «Guardar» cabe, y así se ve igual que el
              // de la ficha del profesional y que el «Llamar» de al lado.
              "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full border bg-white px-4 text-[13px] font-bold transition",
              saved ? "border-[#009FD9] text-[#0089bb] hover:bg-[#f2fbfe]" : "border-[#d7e1ea] text-[#162543] hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
            )
          : cn(
              "grid h-9 w-9 place-items-center rounded-full transition hover:bg-[#eef5f9]",
              saved ? "text-[#009fd9]" : "text-[#8fa1b6] hover:text-[#162543]",
            ),
        className,
      )}
    >
      {(showIcon ?? true) && <Bookmark className={bubble || grande ? "h-5 w-5 shrink-0" : sutil || withLabel ? "h-4 w-4 shrink-0" : "h-[18px] w-[18px]"} fill={saved ? "currentColor" : "none"} />}
      {(withLabel || sutil || grande) && <span>{saved ? labels.saved : sutil ? labels.short : labels.save}</span>}
    </button>
  );
}
