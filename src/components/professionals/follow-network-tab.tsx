"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Search, Sparkles, UserCheck, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  avatarUrl: string | null;
  createdAt: string;
};

type View = "following" | "followers";
type Sort = "newest" | "oldest";

export function FollowNetworkTab({ onBack, initialView }: { onBack?: () => void; initialView?: View }) {
  const locale = useLocale();
  const es = locale !== "en";
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const initialNetworkView = initialView ?? (searchParams.get("network") === "followers" ? "followers" : "following");
  const [view, setView] = useState<View>(initialNetworkView);
  const [sort, setSort] = useState<Sort>("newest");
  const [query, setQuery] = useState("");
  const [following, setFollowing] = useState<NetworkItem[]>([]);
  const [followers, setFollowers] = useState<NetworkItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const db = createClient();
    const { data: ownPro } = await db.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
    const [followingResult, followerResult] = await Promise.all([
      db
        .from("professional_follows")
        .select("id, created_at, professionals(id, slug, business_name, profiles(full_name, avatar_url))")
        .eq("follower_id", user.id),
      ownPro
        ? db
            .from("professional_follows")
            .select("id, created_at, profiles!professional_follows_follower_id_fkey(full_name, avatar_url, professionals(id, slug, business_name))")
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
        avatarUrl: profile?.avatar_url ?? null,
        createdAt: row.created_at,
      }];
    });

    if (followingResult.error && getLocalFollowIds(user.id).length > 0) {
      const ids = getLocalFollowIds(user.id);
      const { data: localPros } = await db
        .from("professionals")
        .select("id, slug, business_name, profiles(full_name, avatar_url)")
        .in("id", ids);
      followed = (localPros ?? []).flatMap((pro: any) => {
        const profile = Array.isArray(pro?.profiles) ? pro.profiles[0] : pro?.profiles;
        if (!pro?.id || !pro?.slug) return [];
        return [{
          id: `local-${pro.id}`,
          professionalId: pro.id,
          slug: pro.slug,
          name: pro.business_name || profile?.full_name || (es ? "Profesional" : "Professional"),
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
    setView(initialView ?? (searchParams.get("network") === "followers" ? "followers" : "following"));
  }, [initialView, searchParams]);

  const items = useMemo(() => {
    const source = view === "following" ? following : followers;
    const normalized = query.trim().toLocaleLowerCase(locale);
    return source
      .filter((item) => !normalized || item.name.toLocaleLowerCase(locale).includes(normalized))
      .sort((a, b) => sort === "newest"
        ? Date.parse(b.createdAt) - Date.parse(a.createdAt)
        : Date.parse(a.createdAt) - Date.parse(b.createdAt));
  }, [followers, following, locale, query, sort, view]);

  const title = es ? "Seguidos y seguidores" : "Following and followers";
  const subtitle = es
    ? "Administra profesionales que sigues y revisa quién sigue tu perfil profesional."
    : "Manage the professionals you follow and see who follows your professional profile.";
  const activeTotal = view === "following" ? following.length : followers.length;
  const otherTotal = view === "following" ? followers.length : following.length;
  const updatedLabel = items[0]
    ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(items[0].createdAt))
    : (es ? "sin actividad" : "no activity");

  return (
    <div className="min-h-[calc(100svh-88px)] bg-[#f3f7fa]">
      <div className="sticky top-0 z-10 grid min-h-16 grid-cols-[52px_minmax(0,1fr)_52px] items-center border-b border-[#e5e7eb] bg-white px-2 lg:min-h-[76px] lg:px-5">
        <button
          type="button"
          onClick={onBack}
          aria-label={es ? "Volver al panel" : "Back to panel"}
          className="grid h-10 w-10 place-items-center rounded-full text-[#526277] transition hover:bg-[#f3f7fa] hover:text-[#102746]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <h2 className="truncate text-base font-extrabold text-[#162543] lg:text-xl">{title}</h2>
          <p className="hidden truncate text-sm text-[#6b7b90] lg:block">{subtitle}</p>
        </div>
      </div>

      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 py-4 sm:px-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:py-8">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-[#dfe8f0] bg-white p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#e9f7fc] text-[#0089bb]">
                <Users className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-[#162543]">{title}</p>
                <p className="mt-1 text-sm leading-5 text-[#6b7b90]">{subtitle}</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <NetworkMetric active={view === "following"} label={es ? "Seguidos" : "Following"} value={following.length} onClick={() => setView("following")} />
              <NetworkMetric active={view === "followers"} label={es ? "Seguidores" : "Followers"} value={followers.length} onClick={() => setView("followers")} />
            </div>
          </div>

          <div className="hidden rounded-2xl border border-[#dfe8f0] bg-white p-5 shadow-sm lg:block">
            <div className="flex items-center gap-2 text-sm font-extrabold text-[#162543]">
              <Sparkles className="h-4 w-4 text-[#009FD9]" />
              {es ? "Para qué sirve" : "How this helps"}
            </div>
            <p className="mt-2 text-sm leading-6 text-[#6b7b90]">
              {es
                ? "Usa seguidos para volver rápido a profesionales de confianza. Tus seguidores muestran el interés real que está generando tu perfil."
                : "Use following to return quickly to trusted professionals. Followers show the real interest your profile is generating."}
            </p>
          </div>
        </aside>

        <section className="min-w-0 rounded-2xl border border-[#dfe8f0] bg-white shadow-sm">
          <div className="border-b border-[#edf1f4] p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-[#162543]">
                  {view === "following" ? (es ? "Profesionales seguidos" : "Followed professionals") : (es ? "Seguidores de tu perfil" : "Profile followers")}
                </h3>
                <p className="mt-1 text-sm text-[#6b7b90]">
                  {es
                    ? `${activeTotal} en esta lista. ${otherTotal} en la otra sección. Última actividad: ${updatedLabel}.`
                    : `${activeTotal} in this list. ${otherTotal} in the other section. Last activity: ${updatedLabel}.`}
                </p>
              </div>
              <div className="inline-flex rounded-xl bg-[#eef3f7] p-1">
                {(["following", "followers"] as View[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setView(item)}
                    className={`rounded-lg px-3 py-2 text-sm font-bold transition ${view === item ? "bg-white text-[#102746] shadow-sm" : "text-[#65758b]"}`}
                  >
                    {item === "following" ? (es ? "Seguidos" : "Following") : (es ? "Seguidores" : "Followers")}
                    <span className="ml-1.5 text-xs text-[#8492a5]">{item === "following" ? following.length : followers.length}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-[#dce5ec] bg-white px-3 focus-within:border-[#009FD9]">
                <Search className="h-4 w-4 text-[#8492a5]" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={es ? "Buscar por nombre" : "Search by name"}
                  className="min-w-0 flex-1 bg-transparent text-sm outline-none"
                />
              </label>
              <Select value={sort} onValueChange={(value) => setSort(value as Sort)}>
                <SelectTrigger className="h-11 w-full border-[#dce5ec] px-3 font-semibold text-[#526277] focus-visible:ring-2 focus-visible:ring-[#009FD9]/20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="w-[190px]">
                  <SelectItem value="newest">{es ? "Más recientes" : "Newest"}</SelectItem>
                  <SelectItem value="oldest">{es ? "Más antiguos" : "Oldest"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((item) => <div key={item} className="h-24 animate-pulse rounded-2xl bg-[#eef3f7]" />)}
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#cdd9e2] bg-[#f8fbfd] px-4 py-10 text-center">
                <Users className="h-8 w-8 text-[#8da0b4]" />
                <p className="mt-3 text-base font-extrabold text-[#34445b]">
                  {view === "following"
                    ? (es ? "Todavía no sigues profesionales" : "You are not following professionals yet")
                    : (es ? "Todavía no tienes seguidores" : "You do not have followers yet")}
                </p>
                <p className="mt-1 max-w-md text-sm leading-6 text-[#6b7b90]">
                  {view === "following"
                    ? (es ? "Cuando sigas un perfil desde buscar o desde su perfil, aparecerá aquí para volver rápido." : "When you follow a profile from search or from their profile, it will appear here.")
                    : (es ? "Cuando clientes o profesionales sigan tu perfil, podrás verlos aquí." : "When clients or professionals follow your profile, you will see them here.")}
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {items.map((item) => (
                  <article key={item.id} className="group flex items-center gap-4 rounded-2xl border border-[#e1e8ee] bg-white p-4 transition hover:border-[#b9ddea] hover:bg-[#f8fbfd]">
                    <Avatar className="h-14 w-14 shrink-0 ring-4 ring-[#eef7fb]">
                      <AvatarImage src={item.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="bg-[#eaf7fc] text-base font-extrabold text-[#0089bb]">{getInitials(item.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      {item.slug ? (
                        <Link href={`/profesionales/${item.slug}`} className="inline-flex max-w-full items-center gap-1 truncate text-base font-extrabold text-[#162543] hover:text-[#0089bb]">
                          <span className="truncate">{item.name}</span>
                          <ArrowUpRight className="h-4 w-4 shrink-0 opacity-0 transition group-hover:opacity-100" />
                        </Link>
                      ) : (
                        <p className="truncate text-base font-extrabold text-[#162543]">{item.name}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#7c8ba0]">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#eef3f7] px-2.5 py-1">
                          <UserCheck className="h-3.5 w-3.5 text-[#009FD9]" />
                          {view === "following" ? (es ? "Seguido desde" : "Followed since") : (es ? "Te sigue desde" : "Follows since")}
                        </span>
                        <span>{new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(item.createdAt))}</span>
                      </div>
                    </div>
                    <div className="shrink-0">
                      {item.professionalId && <FollowButton professionalId={item.professionalId} />}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function NetworkMetric({ active, label, value, onClick }: { active: boolean; label: string; value: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border px-3 py-3 text-left transition ${active ? "border-[#98d9ee] bg-[#eef9fd]" : "border-[#e1e8ee] bg-white hover:bg-[#f7fafc]"}`}
    >
      <span className="block text-2xl font-extrabold text-[#102746]">{value}</span>
      <span className="text-xs font-bold text-[#65758b]">{label}</span>
    </button>
  );
}
