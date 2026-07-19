"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, MapPin, Star, ExternalLink, Wrench } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { applyPendingSavedPro, getSavedPros, syncSavedPros, unsavePro, type SavedPro } from "./save-button";
import { useLocale, useTranslations } from "next-intl";
import { formatServicePrice } from "@/lib/pricing";
import { getCategoryLabel } from "@/lib/data/categories";
import { PanelEmptyState, PanelSectionLoading } from "@/components/ui/content-loading";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

function SavedProCard({ pro, onUnsave }: { pro: SavedPro; onUnsave: (id: string) => void }) {
  const tSaved = useTranslations("savedPros");
  const tCard = useTranslations("card");
  const locale = useLocale();

  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-4 p-4 transition-colors hover:bg-[#fafafa] sm:flex sm:items-center sm:gap-4">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="h-16 w-16 overflow-hidden rounded-2xl flex items-center justify-center text-lg font-bold bg-[#EBF5FB] text-[#009FD9] sm:h-14 sm:w-14">
          {pro.avatarUrl ? (
            <img src={pro.avatarUrl} alt={pro.fullName} className="w-full h-full object-cover" />
          ) : (
            pro.fullName.split(" ").map((n) => n[0]).join("").slice(0, 2)
          )}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold leading-5 text-[#162543] text-sm">{pro.fullName}</span>
          {pro.isVerified && (
            <span className="inline-flex w-fit items-center rounded-full bg-[#009FD9] px-2 py-0.5 text-[10px] font-semibold text-white">
              {tCard("verifiedShort")}
            </span>
          )}
        </div>
        <div className="mt-1 grid gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <span className="flex items-center gap-1 text-xs text-[#6b7280]">
            <Wrench className="h-3 w-3 shrink-0 text-[#374151]" /> {getCategoryLabel(pro.categoryId, locale)}
          </span>
          <span className="flex items-center gap-1 text-xs text-[#6b7280]">
            <MapPin className="h-3 w-3 shrink-0 text-[#374151]" />
            {[pro.cantonName, pro.provinceName].filter(Boolean).join(", ")}
          </span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          {pro.reviewCount > 0 ? (
            <>
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-xs text-[#374151] font-medium">{pro.ratingAvg.toFixed(1)}</span>
              <span className="text-xs text-[#9ca3af]">({pro.reviewCount})</span>
            </>
          ) : (
            <span className="text-xs text-[#9ca3af]">{tSaved("noReviews")}</span>
          )}
          {pro.hourlyRate && (
            <span className="text-xs text-[#9ca3af] ml-2">
              · {formatServicePrice(pro.hourlyRate, "por_hora", locale)}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:shrink-0">
        <Button variant="outline" size="sm" className="min-w-0 flex-1 sm:flex-none" asChild>
          <Link href={`/profesionales/${pro.slug}`}>
            <ExternalLink className="h-3.5 w-3.5" />
            {tSaved("viewProfile")}
          </Link>
        </Button>
        <button
          onClick={() => onUnsave(pro.id)}
          aria-label={tSaved("unsave")}
          className="p-2 rounded-xl text-[#009FD9] hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Bookmark className="h-4 w-4 fill-current" />
        </button>
      </div>
    </div>
  );
}

export function SavedProfessionalsTab() {
  const t = useTranslations("savedPros");
  const { user, loading: authLoading } = useAuth();
  const [saved, setSaved] = useState<SavedPro[]>([]);
  const [mounted, setMounted] = useState(false);

  const refresh = useCallback(() => {
    setSaved(user ? getSavedPros(user.id) : []);
  }, [user]);

  useEffect(() => {
    queueMicrotask(async () => {
      if (user) {
        await applyPendingSavedPro(user.id);
        await syncSavedPros(user.id, true);
      }
      setMounted(true);
      refresh();
    });
    window.addEventListener("savedProsChanged", refresh);
    return () => window.removeEventListener("savedProsChanged", refresh);
  }, [refresh, user]);

  async function handleUnsave(id: string) {
    if (user) {
      unsavePro(id, user.id);
      await createClient()
        .from("saved_professionals")
        .delete()
        .eq("client_id", user.id)
        .eq("professional_id", id);
    }
    setSaved((prev) => prev.filter((p) => p.id !== id));
  }

  if (!mounted || authLoading) {
    return <PanelSectionLoading />;
  }

  if (saved.length === 0) {
    return (
      <PanelEmptyState
        icon={Bookmark}
        title={t("empty")}
        description={t("emptySub")}
        action={<Button asChild><Link href="/buscar">{t("searchPros")}</Link></Button>}
      />
    );
  }

  return (
    <div>
      <p className="text-sm text-[#6b7280] mb-4">{t("count", { count: saved.length })}</p>
      {/* One container; saved pros are divider-separated rows inside it. */}
      <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden divide-y divide-[#f3f4f6]">
        {saved.map((pro) => (
          <SavedProCard key={pro.id} pro={pro} onUnsave={handleUnsave} />
        ))}
      </div>
    </div>
  );
}
