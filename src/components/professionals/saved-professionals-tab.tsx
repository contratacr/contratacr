"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, BriefcaseBusiness, ExternalLink, MapPin, Star, Tag, Trash2, Video, Wrench } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { PanelListSkeleton } from "@/components/ui/content-loading";
import { StatusFilterTabs } from "@/components/dashboard/status-filter-tabs";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { formatServicePrice } from "@/lib/pricing";
import { getCategoryLabel } from "@/lib/data/categories";
import { applyPendingSavedPro, getSavedPros, syncSavedPros, unsaveProRemote, type SavedPro } from "./save-button";
import { openInNewTabOnDesktop } from "@/lib/desktop-new-tab";
import { getProfessionalDisplayName } from "@/lib/display-name";
import { ResponsiveVerifiedName } from "@/components/professionals/responsive-verified-name";
import { ProgressiveImage } from "@/components/ui/progressive-image";

type SavedFilter = "professionals" | "offers" | "jobs";
type SavedItemKind = "offer" | "job";

type SavedItem = {
  id: string;
  item_type: SavedItemKind;
  item_id: string;
  snapshot: Record<string, unknown>;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function SavedProCard({ pro, onUnsave }: { pro: SavedPro; onUnsave: (id: string) => void }) {
  const tSaved = useTranslations("savedPros");
  const tCard = useTranslations("card");
  const locale = useLocale();
  const physicalLocationLabel = [pro.cantonName, pro.provinceName].filter(Boolean).join(", ");
  const isVideoConsult = !physicalLocationLabel && (pro.videoconsulta || pro.coverage?.country);
  const locationLabel = physicalLocationLabel
    || (isVideoConsult ? tSaved("videoConsult") : tSaved("locationUnavailable"));
  const displayName = getProfessionalDisplayName(pro.fullName, pro.businessName).primaryDesktop;

  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-4 p-4 transition-colors hover:bg-[#fafafa] sm:flex sm:items-center sm:gap-4">
      <div className="relative shrink-0">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-[#EBF5FB] text-lg font-bold text-[#009FD9] sm:h-14 sm:w-14">
          {pro.avatarUrl ? (
            <ProgressiveImage src={pro.avatarUrl} alt={displayName} fit="cover" wrapperClassName="h-full w-full" />
          ) : (
            displayName.split(" ").map((n) => n[0]).join("").slice(0, 2)
          )}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        {/* Same verified mark as the /buscar card: the check sits right after the
            name and the name truncates before it, never the other way around. */}
        <div className="flex min-w-0 items-center text-sm font-semibold leading-5 text-[#162543]">
          <ResponsiveVerifiedName
            name={displayName}
            verified={pro.isVerified}
            verifiedLabel={tCard("verifiedShort")}
          />
        </div>
        <div className="mt-1 grid gap-1 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
          <span className="flex items-center gap-1 text-xs text-[#6b7280]">
            <Wrench className="h-3 w-3 shrink-0 text-[#374151]" /> {getCategoryLabel(pro.categoryId, locale)}
          </span>
          <span className="flex items-center gap-1 text-xs text-[#6b7280]">
            {isVideoConsult ? <Video className="h-3 w-3 shrink-0 text-[#374151]" /> : <MapPin className="h-3 w-3 shrink-0 text-[#374151]" />}
            {locationLabel}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1">
          {pro.reviewCount > 0 ? (
            <>
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="text-xs font-medium text-[#374151]">{pro.ratingAvg.toFixed(1)}</span>
              <span className="text-xs text-[#9ca3af]">({pro.reviewCount})</span>
            </>
          ) : null}
          {pro.hourlyRate && (
            <span className="ml-2 text-xs text-[#9ca3af]">
              · {formatServicePrice(pro.hourlyRate, "por_hora", locale)}
            </span>
          )}
        </div>
      </div>

      <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:shrink-0">
        <Button variant="outline" size="sm" className="min-w-0 flex-1 sm:flex-none" asChild>
          <Link href={`/profesionales/${pro.slug}?from=${encodeURIComponent("/dashboard/cliente?tab=saved")}`} onClick={openInNewTabOnDesktop}>
            <ExternalLink className="h-3.5 w-3.5" />
            {tSaved("viewProfile")}
          </Link>
        </Button>
        <button
          type="button"
          onClick={() => onUnsave(pro.id)}
          aria-label={tSaved("unsave")}
          className="rounded-xl p-2 text-[#009FD9] transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Bookmark className="h-4 w-4 fill-current" />
        </button>
      </div>
    </div>
  );
}

function SavedGenericCard({ item, onRemove }: { item: SavedItem; onRemove: (item: SavedItem) => void }) {
  const t = useTranslations("savedPros");
  const snapshot = item.snapshot ?? {};
  const isJob = item.item_type === "job";
  const title = text(snapshot.title, isJob ? t("favoriteJob") : t("favoriteOffer"));
  const owner = text(snapshot.employer_name ?? snapshot.professional_name, "ContrataCR");
  const image = text(snapshot.image_url ?? snapshot.employer_avatar_url);
  const meta = isJob
    ? [text(snapshot.location_label, "Costa Rica"), text(snapshot.salary)].filter(Boolean).join(" · ")
    : [text(snapshot.service_label), text(snapshot.price)].filter(Boolean).join(" · ");
  const href = isJob ? `/empleos/${item.item_id}` : `/ofertas/${item.item_id}`;
  const Icon = isJob ? BriefcaseBusiness : Tag;

  return (
    <div className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 p-4 transition-colors hover:bg-[#fafafa] sm:flex sm:items-center">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#eef7fb] text-[#009FD9]">
        {image ? <ProgressiveImage src={image} alt={title} fit="cover" wrapperClassName="h-full w-full" /> : <Icon className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#eef7fb] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#007fae]">
            {isJob ? t("jobBadge") : t("offerBadge")}
          </span>
        </div>
        <h3 className="mt-1 truncate text-sm font-extrabold text-[#162543]">{title}</h3>
        <p className="mt-0.5 truncate text-sm font-semibold text-[#53657d]">{owner}</p>
        {meta && <p className="mt-1 truncate text-xs font-semibold text-[#007fae]">{meta}</p>}
      </div>
      <div className="col-span-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:shrink-0">
        <Button variant="outline" size="sm" className="min-w-0 flex-1 sm:flex-none" asChild>
          <Link href={href}>
            <ExternalLink className="h-3.5 w-3.5" />
            {t("view")}
          </Link>
        </Button>
        <button
          type="button"
          onClick={() => onRemove(item)}
          aria-label={t("unsave")}
          className="rounded-xl p-2 text-[#8fa1b6] transition-colors hover:bg-red-50 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export function SavedProfessionalsTab() {
  const t = useTranslations("savedPros");
  const { user, loading: authLoading } = useAuth();
  const [savedPros, setSavedPros] = useState<SavedPro[]>([]);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [filter, setFilter] = useState<SavedFilter>("professionals");
  const [mounted, setMounted] = useState(false);

  const refreshPros = useCallback(() => {
    setSavedPros(user ? getSavedPros(user.id) : []);
  }, [user]);

  const refreshItems = useCallback(async () => {
    if (!user) {
      setSavedItems([]);
      return;
    }
    const { data } = await createClient()
      .from("saved_items")
      .select("id,item_type,item_id,snapshot")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setSavedItems(((data ?? []) as SavedItem[]).filter((item) => item.item_type === "offer" || item.item_type === "job"));
  }, [user]);

  useEffect(() => {
    queueMicrotask(async () => {
      if (user) {
        await applyPendingSavedPro(user.id);
        await syncSavedPros(user.id, true);
        await refreshItems();
      }
      setMounted(true);
      refreshPros();
    });
    const refreshAll = () => {
      refreshPros();
      void refreshItems();
    };
    window.addEventListener("savedProsChanged", refreshAll);
    window.addEventListener("savedItemsChanged", refreshAll);
    return () => {
      window.removeEventListener("savedProsChanged", refreshAll);
      window.removeEventListener("savedItemsChanged", refreshAll);
    };
  }, [refreshItems, refreshPros, user]);

  async function handleUnsavePro(id: string) {
    if (user) {
      await unsaveProRemote(id, user.id);
    }
    setSavedPros((prev) => prev.filter((p) => p.id !== id));
  }

  async function handleRemoveItem(item: SavedItem) {
    if (!user) return;
    await createClient()
      .from("saved_items")
      .delete()
      .eq("user_id", user.id)
      .eq("item_type", item.item_type)
      .eq("item_id", item.item_id);
    setSavedItems((prev) => prev.filter((current) => current.id !== item.id));
    window.dispatchEvent(new CustomEvent("savedItemsChanged"));
  }

  const offers = useMemo(() => savedItems.filter((item) => item.item_type === "offer"), [savedItems]);
  const jobs = useMemo(() => savedItems.filter((item) => item.item_type === "job"), [savedItems]);
  const total = savedPros.length + offers.length + jobs.length;
  const showPros = filter === "professionals";
  const showOffers = filter === "offers";
  const showJobs = filter === "jobs";

  // These are the three saveable content types. Keep every filter visible even
  // when its current count is zero; only the former aggregate “Todos” filter is
  // intentionally absent.
  const availableFilters: SavedFilter[] = ["professionals", "offers", "jobs"];

  if (!mounted || authLoading) return <PanelListSkeleton rows={3} hasData={total > 0} />;

  const tabs = availableFilters.map((id) => ({ id }));
  const tabLabels: Record<string, string> = {
    professionals: t("professionalsTab"),
    offers: t("offersTab"),
    jobs: t("jobsTab"),
  };
  const tabCounts = {
    professionals: savedPros.length,
    offers: offers.length,
    jobs: jobs.length,
  };
  const selectedCount = showPros ? savedPros.length : showOffers ? offers.length : jobs.length;
  const selectedEmptyLabel = showPros
    ? t("emptyProfessionals")
    : showOffers
      ? t("emptyOffers")
      : t("emptyJobs");

  return (
    <div className="ccr-native-safe-list-end space-y-4">
      <StatusFilterTabs
        tabs={tabs}
        value={filter}
        onChange={(id) => setFilter(id as SavedFilter)}
        counts={tabCounts}
        labelFor={(id) => tabLabels[id] ?? id}
      />

      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white divide-y divide-[#f3f4f6]">
        {showPros && savedPros.map((pro) => <SavedProCard key={`pro-${pro.id}`} pro={pro} onUnsave={handleUnsavePro} />)}
        {showOffers && offers.map((item) => <SavedGenericCard key={item.id} item={item} onRemove={handleRemoveItem} />)}
        {showJobs && jobs.map((item) => <SavedGenericCard key={item.id} item={item} onRemove={handleRemoveItem} />)}
        {selectedCount === 0 && (
          <div className="space-y-3 px-4 py-8 text-center">
            <Bookmark className="mx-auto h-7 w-7 text-[#009FD9]" aria-hidden="true" />
            <p className="text-sm font-semibold text-[#6b7280]">{selectedEmptyLabel}</p>
            {showPros && (
              <Button asChild><Link href="/buscar">{t("searchPros")}</Link></Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
