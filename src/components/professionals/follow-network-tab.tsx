"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { FollowButton, getLocalFollowIds } from "@/components/professionals/follow-button";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";

type NetworkItem = {
  id: string;
  professionalId: string;
  slug: string;
  name: string;
  subtitle: string;
  avatarUrl: string | null;
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

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const db = createClient();
    const { data: ownPro } = await db.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
    const [followingResult, followerResult] = await Promise.all([
      db
        .from("professional_follows")
        .select("id, created_at, professionals(id, slug, business_name, professions, profiles(full_name, avatar_url))")
        .eq("follower_id", user.id),
      ownPro
        ? db
            .from("professional_follows")
            .select("id, created_at, profiles!professional_follows_follower_id_fkey(full_name, avatar_url, professionals(id, slug, business_name, professions))")
            .eq("professional_id", ownPro.id)
        : Promise.resolve({ data: [] }),
    ]);

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
        createdAt: row.created_at,
      }];
    });

    if (followingResult.error && getLocalFollowIds(user.id).length > 0) {
      const ids = getLocalFollowIds(user.id);
      const { data: localPros } = await db
        .from("professionals")
        .select("id, slug, business_name, professions, profiles(full_name, avatar_url)")
        .in("id", ids);
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
          createdAt: new Date().toISOString(),
        }];
      });
    }

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
        createdAt: row.created_at,
      }];
    });

    setFollowing(followed);
    setFollowers(followedBy);
    setLoading(false);
  }, [es, user]);

  useEffect(() => {
    void load();
    window.addEventListener("professionalFollowsChanged", load);
    return () => window.removeEventListener("professionalFollowsChanged", load);
  }, [load]);

  useEffect(() => {
    if (!loading) {
      setShowLoadingSkeleton(false);
      return;
    }
    setShowLoadingSkeleton(false);
    const timer = window.setTimeout(() => setShowLoadingSkeleton(true), 350);
    return () => window.clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    setView(initialView ?? (searchParams.get("network") === "followers" ? "followers" : "following"));
  }, [initialView, searchParams]);

  const items = useMemo(() => {
    const source = view === "following" ? following : followers;
    const normalized = query.trim().toLocaleLowerCase(locale);
    return source
      .filter((item) => !normalized || `${item.name} ${item.subtitle}`.toLocaleLowerCase(locale).includes(normalized))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [followers, following, locale, query, view]);

  const title = view === "following" ? (es ? "Seguidos" : "Following") : (es ? "Seguidores" : "Followers");

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#111827]/72 px-3 py-5 backdrop-blur-[1px]">
      <section className="flex h-[min(72svh,410px)] min-h-[360px] w-full max-w-[560px] flex-col overflow-hidden rounded-[22px] bg-white shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)]">
        <header className="grid h-12 shrink-0 grid-cols-[48px_minmax(0,1fr)_48px] items-center border-b border-[#dfe3e8]">
          <span />
          <h2 className="truncate text-center text-base font-semibold text-[#111827]">{title}</h2>
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
          {loading && showLoadingSkeleton ? (
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
            <div className="h-full min-h-[230px]" aria-busy="true" aria-label={tLoading("profile")} />
          ) : items.length === 0 ? (
            <div className="grid h-full min-h-[230px] place-items-center text-center text-sm font-medium text-[#6b7280]">
              {query ? (es ? "No encontramos resultados." : "No results found.") : (es ? "Todavía no hay perfiles aquí." : "No profiles here yet.")}
            </div>
          ) : (
            <ul className="space-y-1">
              {items.map((item) => (
                <li key={item.id} className="flex min-h-[58px] items-center gap-3">
                  <Link href={item.slug ? `/profesionales/${item.slug}` : "#"} onClick={item.slug ? onBack : undefined} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={item.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="bg-[#eaf7fc] text-sm font-extrabold text-[#0089bb]">{getInitials(item.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold leading-5 text-[#111827]">{item.name}</span>
                      <span className="block truncate text-sm leading-5 text-[#6b7280]">{item.subtitle}</span>
                    </span>
                  </Link>
                  <div className="shrink-0">
                    {item.professionalId ? (
                      <FollowButton professionalId={item.professionalId} compact labelOverride={view === "followers" ? (es ? "Quitar" : "Remove") : undefined} />
                    ) : (
                      <button type="button" className="h-8 rounded-lg bg-[#eef0f2] px-4 text-sm font-semibold text-[#111827]">
                        {view === "followers" ? (es ? "Quitar" : "Remove") : (es ? "Siguiendo" : "Following")}
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
