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
  loginRedirect,
}: SaveItemButtonProps) {
  const locale = useLocale();
  const [saved, setSaved] = useState(false);
  const payload = useMemo(() => ({ ...snapshot, id: itemId, type: itemType }), [itemId, itemType, snapshot]);

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
      aria-label={saved ? "Quitar de guardados" : "Guardar"}
      aria-pressed={saved}
      className={cn(
        withLabel
          ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#cddae6] bg-white px-4 text-sm font-bold text-[#162543] transition hover:border-[#9fc8dd] hover:bg-[#f8fbfd]"
          : "grid h-9 w-9 place-items-center rounded-full text-[#8fa1b6] transition hover:bg-[#eef5f9] hover:text-[#162543]",
        saved && "text-[#009fd9]",
        className,
      )}
    >
      <Bookmark className={withLabel ? "h-4 w-4" : "h-[18px] w-[18px]"} fill={saved ? "currentColor" : "none"} />
      {withLabel && <span>{saved ? "Guardado" : "Guardar"}</span>}
    </button>
  );
}
