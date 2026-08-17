"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Search, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FollowButton, getLocalFollowIds } from "@/components/professionals/follow-button";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { PanelSectionLoading } from "@/components/ui/content-loading";

type NetworkItem = {
  id: string;
  professionalId: string;
  slug: string;
  name: string;
  subtitle: string;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
};

type View = "following" | "followers";

export function FollowNetworkTab({ onBack, initialView }: { onBack?: () => void; initialView?: View }) {
  const locale = useLocale();
  const tLoading = useTranslations("loading");
  const es = locale !== "en";
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const initialNetworkView = initialView ?? (searchParams.get("network") === "followers" ? "followers" : "following");
  const [view, setView] = useState<View>(initialNetworkView);
  const [query, setQuery] = useState("");
  const [following, setFollowing] = useState<NetworkItem[]>([]);
  const [followers, setFollowers] = useState<NetworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLoadingSkeleton, setShowLoadingSkeleton] = useState(false);
  const [removingFollowerId, setRemovingFollowerId] = useState<string | null>(null);
  const [removeFollowerError, setRemoveFollowerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const db = createClient();
    const { data: ownPro } = await db.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
    const [followingResult, followerResult] = await Promise.all([
      db
        .from("professional_follows")
        .select("id, created_at, professionals(id, slug, business_name, professions, verification_status, profiles(full_name, avatar_url))")
        .eq("follower_id", user.id),
      ownPro
        ? db
            .from("professional_follows")
            .select("id, created_at, profiles!professional_follows_follower_id_fkey(full_name, avatar_url, professionals(id, slug, business_name, professions, verification_status))")
            .eq("professional_id", ownPro.id)
        : Promise.resolve({ data: [] }),
    ]);

    // Supabase's nested relationship payload is not represented by generated DB
    // types in this project yet; normalize it defensively at this boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let followed = (followingResult.data ?? []).flatMap((row: any) => {
      const pro = Array.isArray(row.professionals) ? row.professionals[0] : row.professionals;
      const profile = Array.isArray(pro?.profiles) ? pro.profiles[0] : pro?.profiles;
      if (!pro?.id || !pro?.slug) return [];
      return [{
        id: row.id,
        professionalId: pro.id,
        slug: pro.slug,
        name: pro.business_name || profile?.full_name || (es ? "Profesional" : "Professional"),
        subtitle: profile?.full_name || firstProfession(pro?.professions, es),
        avatarUrl: profile?.avatar_url ?? null,
        isVerified: pro.verification_status === "verified",
        createdAt: row.created_at,
      }];
    });

    if (followingResult.error && getLocalFollowIds(user.id).length > 0) {
      const ids = getLocalFollowIds(user.id);
      const { data: localPros } = await db
        .from("professionals")
        .select("id, slug, business_name, professions, verification_status, profiles(full_name, avatar_url)")
        .in("id", ids);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      followed = (localPros ?? []).flatMap((pro: any) => {
        const profile = Array.isArray(pro?.profiles) ? pro.profiles[0] : pro?.profiles;
        if (!pro?.id || !pro?.slug) return [];
        return [{
          id: `local-${pro.id}`,
          professionalId: pro.id,
          slug: pro.slug,
          name: pro.business_name || profile?.full_name || (es ? "Profesional" : "Professional"),
          subtitle: profile?.full_name || firstProfession(pro?.professions, es),
          avatarUrl: profile?.avatar_url ?? null,
          isVerified: pro.verification_status === "verified",
          createdAt: new Date().toISOString(),
        }];
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const followedBy = (followerResult.data ?? []).flatMap((row: any) => {
      const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      const pro = Array.isArray(profile?.professionals) ? profile.professionals[0] : profile?.professionals;
      if (!profile) return [];
      return [{
        id: row.id,
        professionalId: pro?.id ?? "",
        slug: pro?.slug ?? "",
        name: pro?.business_name || profile.full_name || (es ? "Usuario" : "User"),
        subtitle: pro?.business_name ? profile.full_name : firstProfession(pro?.professions, es),
        avatarUrl: profile.avatar_url ?? null,
        isVerified: pro?.verification_status === "verified",
        createdAt: row.created_at,
      }];
    });

    setFollowing(followed);
    setFollowers(followedBy);
    setLoading(false);
  }, [es, user]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    window.addEventListener("professionalFollowsChanged", load);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener("professionalFollowsChanged", load);
    };
  }, [load]);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => setShowLoadingSkeleton(false), 0);
    if (!loading) {
      return () => window.clearTimeout(resetTimer);
    }
    const timer = window.setTimeout(() => setShowLoadingSkeleton(true), 350);
    return () => {
      window.clearTimeout(resetTimer);
      window.clearTimeout(timer);
    };
  }, [loading]);

  useEffect(() => {
    const syncView = window.setTimeout(() => {
      setView(initialView ?? (searchParams.get("network") === "followers" ? "followers" : "following"));
    }, 0);
    return () => window.clearTimeout(syncView);
  }, [initialView, searchParams]);

  async function removeFollower(followId: string) {
    if (removingFollowerId) return;
    setRemovingFollowerId(followId);
    setRemoveFollowerError(null);
    try {
      const response = await fetch("/api/professional-followers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ followId }),
      });
      const payload = await response.json().catch(() => ({})) as {
        success?: boolean;
        removed?: boolean;
        professionalId?: string;
        followerCount?: number | null;
      };
      if (!response.ok || !payload.success) {
        throw new Error(es ? "No pudimos quitar este seguidor." : "We could not remove this follower.");
      }
      setFollowers((current) => current.filter((item) => item.id !== followId));
      if (payload.professionalId) {
        window.dispatchEvent(new CustomEvent("professionalFollowsChanged", {
          detail: {
            professionalId: payload.professionalId,
            delta: payload.removed ? -1 : 0,
            ...(typeof payload.followerCount === "number" ? { count: payload.followerCount } : {}),
          },
        }));
      }
    } catch (error) {
      setRemoveFollowerError(
        error instanceof Error && error.message
          ? error.message
          : es ? "No pudimos quitar este seguidor." : "We could not remove this follower.",
      );
    } finally {
      setRemovingFollowerId(null);
    }
  }

  const items = useMemo(() => {
    const source = view === "following" ? following : followers;
    const normalized = query.trim().toLocaleLowerCase(locale);
    return source
      .filter((item) => !normalized || `${item.name} ${item.subtitle}`.toLocaleLowerCase(locale).includes(normalized))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [followers, following, locale, query, view]);

  const title = view === "following" ? (es ? "Seguidos" : "Following") : (es ? "Seguidores" : "Followers");

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-[#111827]/72 px-3 py-5 backdrop-blur-[1px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onBack?.();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-network-title"
        className="flex h-[min(72svh,410px)] min-h-[360px] w-full max-w-[560px] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="grid h-12 shrink-0 grid-cols-[48px_minmax(0,1fr)_48px] items-center border-b border-[#dfe3e8]">
          <span />
          <h2 id="follow-network-title" className="truncate text-center text-base font-semibold text-[#111827]">{title}</h2>
          <button
            type="button"
            onClick={onBack}
            aria-label={es ? "Cerrar" : "Close"}
            className="grid h-12 w-12 place-items-center text-[#111827]"
          >
            <X className="h-6 w-6" />
          </button>
        </header>

        <div className="shrink-0 px-4 py-2">
          <label className="flex h-9 items-center gap-2 rounded-lg bg-[#eef0f2] px-3">
            <Search className="h-4 w-4 text-[#7b8490]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={es ? "Buscar" : "Search"}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#111827] outline-none placeholder:text-[#7b8490]"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
          {removeFollowerError && (
            <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {removeFollowerError}
            </p>
          )}
          {loading && showLoadingSkeleton && items.length > 0 ? (
            <div className="space-y-3 py-2">
              {[0, 1, 2, 3, 4].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <div className="h-11 w-11 animate-pulse rounded-full bg-[#eef0f2]" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-3 w-32 animate-pulse rounded bg-[#eef0f2]" />
                    <div className="h-3 w-44 animate-pulse rounded bg-[#eef0f2]" />
                  </div>
                  <div className="h-8 w-20 animate-pulse rounded-lg bg-[#eef0f2]" />
                </div>
              ))}
            </div>
          ) : loading ? (
            <PanelSectionLoading title={tLoading("profile")} className="h-full min-h-[230px] sm:min-h-[230px]" />
          ) : items.length === 0 ? (
            <div className="grid h-full min-h-[230px] place-items-center text-center text-sm font-medium text-[#6b7280]">
              {query ? (es ? "No encontramos resultados." : "No results found.") : (es ? "Todavía no hay perfiles aquí." : "No profiles here yet.")}
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li data-follow-relation-id={item.id} key={item.id} className="flex min-h-[58px] items-center gap-3">
                  <Link href={item.slug ? `/profesionales/${item.slug}` : "#"} onClick={item.slug ? onBack : undefined} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={item.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="bg-[#eaf7fc] text-sm font-extrabold text-[#0089bb]">{getInitials(item.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center text-sm font-bold leading-5 text-[#111827]">
                        <span className="truncate">{item.name}</span>
                        {item.isVerified && (
                          <CheckCircle2
                            aria-label={es ? "Verificado" : "Verified"}
                            className="ml-1 h-3.5 w-3.5 shrink-0 text-[#009FD9]"
                          />
                        )}
                      </span>
                      <span className="block truncate text-sm leading-5 text-[#6b7280]">{item.subtitle}</span>
                    </span>
                  </Link>
                  <div className="shrink-0">
                    {view === "followers" ? (
                      <button
                        type="button"
                        onClick={() => void removeFollower(item.id)}
                        disabled={removingFollowerId !== null}
                        className="inline-flex h-8 min-w-[96px] items-center justify-center rounded-lg bg-[#f0f2f5] px-4 text-sm font-bold text-[#111827] transition-colors hover:bg-[#e5e9ee] disabled:opacity-60"
                      >
                        {removingFollowerId === item.id
                          ? (es ? "Quitando..." : "Removing...")
                          : (es ? "Quitar" : "Remove")}
                      </button>
                    ) : item.professionalId ? (
                      <FollowButton professionalId={item.professionalId} compact />
                    ) : (
                      <button type="button" className="h-8 rounded-lg bg-[#eef0f2] px-4 text-sm font-semibold text-[#111827]">
                        {es ? "Siguiendo" : "Following"}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function firstProfession(value: unknown, es: boolean) {
  if (Array.isArray(value) && typeof value[0] === "string" && value[0]) return value[0];
  return es ? "Profesional" : "Professional";
}
