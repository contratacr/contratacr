"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark } from "lucide-react";
import { useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type SaveItemKind = "offer" | "job";

type SaveItemButtonProps = {
  itemType: SaveItemKind;
  itemId: string;
  snapshot: Record<string, unknown>;
  userId?: string | null;
  className?: string;
  withLabel?: boolean;
  /** Marcador en círculo, para la esquina de una tarjeta o sobre una foto. */
  bubble?: boolean;
  showIcon?: boolean;
  loginRedirect?: string;
};

const EVENT_NAME = "savedItemsChanged";

export function SaveItemButton({
  itemType,
  itemId,
  snapshot,
  userId,
  className,
  withLabel = false,
  bubble = false,
  showIcon,
  loginRedirect,
}: SaveItemButtonProps) {
  const locale = useLocale();
  const [saved, setSaved] = useState(false);
  const payload = useMemo(() => ({ ...snapshot, id: itemId, type: itemType }), [itemId, itemType, snapshot]);
  // El mismo rótulo que en el perfil: nombra la acción y dónde queda.
  const labels = locale === "en"
    ? { save: "Save to favorites", saved: "Saved", remove: itemType === "offer" ? "Remove offer from favorites" : "Remove job from favorites" }
    : { save: "Guardar en favoritos", saved: "Guardado", remove: itemType === "offer" ? "Quitar oferta de favoritos" : "Quitar empleo de favoritos" };

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
        bubble
          ? cn(
              "grid h-11 w-11 place-items-center rounded-full border bg-white transition-colors duration-200",
              saved
                ? "border-[#009FD9] bg-[#eaf7fc] text-[#0089bb]"
                : "border-[#d7e1ea] text-[#162543] hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
            )
          : withLabel
          ? cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-full border bg-white px-4 text-sm font-bold transition",
              saved ? "border-[#009FD9] text-[#0089bb] hover:bg-[#f2fbfe]" : "border-[#d7e1ea] text-[#162543] hover:border-[#b9c8d6] hover:bg-[#f6f9fb]",
            )
          : cn(
              "grid h-9 w-9 place-items-center rounded-full transition hover:bg-[#eef5f9]",
              saved ? "text-[#009fd9]" : "text-[#8fa1b6] hover:text-[#162543]",
            ),
        className,
      )}
    >
      {(showIcon ?? true) && <Bookmark className={bubble ? "h-5 w-5" : withLabel ? "h-4 w-4 shrink-0" : "h-[18px] w-[18px]"} fill={saved ? "currentColor" : "none"} />}
      {withLabel && <span>{saved ? labels.saved : labels.save}</span>}
    </button>
  );
}
