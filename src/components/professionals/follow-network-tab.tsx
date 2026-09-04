"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ChevronLeft, Search, UserRoundMinus, UsersRound, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CardActionsMenu } from "@/components/dashboard/card-actions-menu";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { FollowButton, getLocalFollowIds, removeLocalFollow } from "@/components/professionals/follow-button";
import { useAppDialog } from "@/hooks/use-app-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useNativeFullscreenLayer } from "@/hooks/use-native-app";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, getInitials } from "@/lib/utils";

type NetworkItem = {
  id: string;
  professionalId: string;
  slug: string;
  name: string;
  subtitle: string;
  avatarUrl: string | null;
  isVerified: boolean;
  createdAt: string;
  categoryId?: string;
};

type View = "following" | "followers";

// Cada sugerencia lleva una razón honesta: te sigue, lo contrataste, o es un
// verificado de tu provincia en un rubro que ya usaste.
type Razon = "te_sigue" | "contratado" | "verificado";
type Sugerido = NetworkItem & { razon: Razon };

type Red = { following: NetworkItem[]; followers: NetworkItem[]; sugeridos: Sugerido[] };

const RED_VACIA: Red = { following: [], followers: [], sugeridos: [] };
const MAX_SUGERIDOS = 6;
// Descartes de la sesión: un "no me interesa" no vuelve mientras la app esté abierta.
const descartados = new Set<string>();

type Db = ReturnType<typeof createClient>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function proAItem(pro: any, id: string, createdAt: string, profesional: string): NetworkItem | null {
  const profile = Array.isArray(pro?.profiles) ? pro.profiles[0] : pro?.profiles;
  if (!pro?.id || !pro?.slug) return null;
  return {
    id,
    professionalId: pro.id,
    slug: pro.slug,
    name: pro.business_name || profile?.full_name || profesional,
    subtitle: profile?.full_name || firstProfession(pro?.professions, profesional),
    avatarUrl: profile?.avatar_url ?? null,
    isVerified: pro.verification_status === "verified",
    createdAt,
    categoryId: typeof pro.category_id === "string" ? pro.category_id : undefined,
  };
}

const PRO_SELECT = "id, slug, business_name, professions, category_id, verification_status, profiles(full_name, avatar_url)";

async function cargarSugeridos(
  db: Db,
  userId: string,
  ownPro: { id: string; provincia_id?: string | null } | null,
  following: NetworkItem[],
  followers: NetworkItem[],
  profesional: string,
): Promise<Sugerido[]> {
  const excluir = new Set(following.map((item) => item.professionalId));
  if (ownPro) excluir.add(ownPro.id);
  const salida: Sugerido[] = [];
  const agregar = (item: NetworkItem | null, razon: Razon) => {
    if (!item?.professionalId || excluir.has(item.professionalId)) return;
    excluir.add(item.professionalId);
    salida.push({ ...item, razon });
  };

  followers.forEach((item) => agregar(item, "te_sigue"));

  const [reservas, propuestas] = await Promise.all([
    db.from("bookings").select("professional_id").eq("client_id", userId).eq("status", "completed"),
    db
      .from("proposals")
      .select("professional_id, projects!inner(client_id, status)")
      .eq("status", "accepted")
      .eq("projects.client_id", userId)
      .eq("projects.status", "completed"),
  ]);
  const contratados = [...new Set([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(reservas.data ?? []).map((row: any) => row.professional_id as string),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(propuestas.data ?? []).map((row: any) => row.professional_id as string),
  ])].filter((id) => id && !excluir.has(id));
  if (contratados.length > 0) {
    const { data } = await db.from("professionals").select(PRO_SELECT).in("id", contratados);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data ?? []).forEach((pro: any) => agregar(proAItem(pro, `sug-${pro.id}`, "", profesional), "contratado"));
  }

  if (ownPro?.provincia_id && salida.length < MAX_SUGERIDOS) {
    const rubros = [...new Set([...following, ...salida].map((item) => item.categoryId).filter((id): id is string => Boolean(id)))];
    let consulta = db
      .from("professionals")
      .select(PRO_SELECT)
      .eq("verification_status", "verified")
      .eq("provincia_id", ownPro.provincia_id)
      .neq("id", ownPro.id)
      .order("rating_avg", { ascending: false })
      .limit(8);
    if (rubros.length > 0) consulta = consulta.in("category_id", rubros);
    const { data } = await consulta;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data ?? []).forEach((pro: any) => agregar(proAItem(pro, `sug-${pro.id}`, "", profesional), "verificado"));
  }

  return salida.slice(0, MAX_SUGERIDOS);
}

export function FollowNetworkTab({ onBack, initialView, title }: { onBack?: () => void; initialView?: View; title?: string }) {
  const locale = useLocale();
  const t = useTranslations("followNetwork");
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { dialogNode, confirm } = useAppDialog();
  // A pantalla completa la vista tapa la barra inferior nativa, igual que un modal de hoja.
  useNativeFullscreenLayer(true);
  const initialNetworkView = initialView ?? (searchParams.get("network") === "followers" ? "followers" : "following");
  const [view, setView] = useState<View>(initialNetworkView);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setDescartes] = useState(0);

  const cargarRed = useCallback(async (): Promise<Red> => {
    if (!user) return RED_VACIA;
    const db = createClient();
    const { data: ownPro } = await db.from("professionals").select("id, provincia_id").eq("profile_id", user.id).maybeSingle();
    const [followingResult, followerResult] = await Promise.all([
      db
        .from("professional_follows")
        .select("id, created_at, professionals(id, slug, business_name, professions, category_id, verification_status, profiles(full_name, avatar_url))")
        .eq("follower_id", user.id),
      ownPro
        ? db
            .from("professional_follows")
            .select("id, created_at, profiles!professional_follows_follower_id_fkey(full_name, avatar_url, professionals(id, slug, business_name, professions, verification_status))")
            .eq("professional_id", ownPro.id)
        : Promise.resolve({ data: [] }),
    ]);

    const profesional = t("professional");
    // Supabase's nested relationship payload is not represented by generated DB
    // types in this project yet; normalize it defensively at this boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let followed = (followingResult.data ?? []).flatMap((row: any) => {
      const pro = Array.isArray(row.professionals) ? row.professionals[0] : row.professionals;
      const item = proAItem(pro, row.id, row.created_at, profesional);
      return item ? [item] : [];
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
          name: pro.business_name || profile?.full_name || profesional,
          subtitle: profile?.full_name || firstProfession(pro?.professions, profesional),
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
        name: pro?.business_name || profile.full_name || t("user"),
        subtitle: pro?.business_name ? profile.full_name : firstProfession(pro?.professions, profesional),
        avatarUrl: profile.avatar_url ?? null,
        isVerified: pro?.verification_status === "verified",
        createdAt: row.created_at,
      }];
    });

    const sugeridos = await cargarSugeridos(db, user.id, ownPro, followed, followedBy, profesional).catch(() => []);
    return { following: followed, followers: followedBy, sugeridos };
  }, [t, user]);

  // Igual que las pestañas del panel: lo que este navegador ya vio se pinta al
  // instante y la red solo lo actualiza; el esqueleto es solo para la primera vez.
  const { data: red, loading: cargandoRed, refresh, setData } = useCachedResource<Red>(
    user ? `follow-network:${user.id}` : null,
    cargarRed,
    RED_VACIA,
  );
  const loading = !user || cargandoRed;

  useEffect(() => {
    const onChange = () => void refresh();
    window.addEventListener("professionalFollowsChanged", onChange);
    return () => window.removeEventListener("professionalFollowsChanged", onChange);
  }, [refresh]);

  useEffect(() => {
    const syncView = window.setTimeout(() => {
      setView(initialView ?? (searchParams.get("network") === "followers" ? "followers" : "following"));
    }, 0);
    return () => window.clearTimeout(syncView);
  }, [initialView, searchParams]);

  async function removeFollower(item: NetworkItem) {
    if (busyId) return;
    const result = await confirm({
      title: t("removeFollowerTitle"),
      description: t("removeFollowerBody", { name: item.name }),
      confirmLabel: t("removeFollowerConfirm"),
      cancelLabel: t("cancel"),
      tone: "danger",
    });
    if (!result.confirmed) return;
    setBusyId(item.id);
    setError(null);
    try {
      const response = await fetch("/api/professional-followers", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ followId: item.id }),
      });
      const payload = await response.json().catch(() => ({})) as {
        success?: boolean;
        removed?: boolean;
        professionalId?: string;
        followerCount?: number | null;
      };
      if (!response.ok || !payload.success) throw new Error(t("removeFollowerError"));
      setData((current) => ({ ...current, followers: current.followers.filter((row) => row.id !== item.id) }));
      if (payload.professionalId) {
        window.dispatchEvent(new CustomEvent("professionalFollowsChanged", {
          detail: {
            professionalId: payload.professionalId,
            delta: payload.removed ? -1 : 0,
            ...(typeof payload.followerCount === "number" ? { count: payload.followerCount } : {}),
          },
        }));
      }
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : t("removeFollowerError"));
    } finally {
      setBusyId(null);
    }
  }

  // Como en Instagram, "Dejar de seguir" desde el menú es inmediato: volver a
  // seguir está a un toque en el perfil.
  async function unfollow(item: NetworkItem) {
    if (!user || busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      const db = createClient();
      const { error: dbError } = await db
        .from("professional_follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("professional_id", item.professionalId);
      if (dbError) throw new Error(t("unfollowError"));
      removeLocalFollow(user.id, item.professionalId);
      setData((current) => ({ ...current, following: current.following.filter((row) => row.professionalId !== item.professionalId) }));
      window.dispatchEvent(new CustomEvent("professionalFollowsChanged", {
        detail: { professionalId: item.professionalId, delta: item.id.startsWith("local-") ? 0 : -1 },
      }));
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : t("unfollowError"));
    } finally {
      setBusyId(null);
    }
  }

  const items = useMemo(() => {
    const source = view === "following" ? red.following : red.followers;
    const normalized = query.trim().toLocaleLowerCase(locale);
    return source
      .filter((item) => !normalized || `${item.name} ${item.subtitle}`.toLocaleLowerCase(locale).includes(normalized))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [locale, query, red, view]);

  const seguidosIds = useMemo(() => new Set(red.following.map((item) => item.professionalId)), [red.following]);
  const sugeridos = red.sugeridos.filter((item) => !descartados.has(item.professionalId) && !seguidosIds.has(item.professionalId));
  const conFranja = view === "following" && !query.trim() && !loading && sugeridos.length > 0;
  const razonLabel: Record<Razon, string> = {
    te_sigue: t("reasonFollowsYou"),
    contratado: t("reasonHired"),
    verificado: t("reasonVerified"),
  };

  const tabs: { key: View; label: string }[] = [
    { key: "followers", label: loading ? t("followers") : t("followersTab", { count: red.followers.length }) },
    { key: "following", label: loading ? t("following") : t("followingTab", { count: red.following.length }) },
  ];
  const heading = title || (view === "following" ? t("following") : t("followers"));

  return (
    <div
      className="app-modal-screen fixed inset-0 z-[220] flex items-stretch justify-center bg-white sm:items-center sm:bg-[#111827]/72 sm:px-3 sm:py-5 sm:backdrop-blur-[1px]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onBack?.();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="follow-network-title"
        className="app-fullscreen-modal flex h-[var(--app-visual-viewport-height)] w-full flex-col overflow-hidden bg-white sm:h-[min(80svh,640px)] sm:max-w-[560px] sm:rounded-[22px] sm:shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="grid h-14 shrink-0 grid-cols-[52px_minmax(0,1fr)_52px] items-center px-1">
          <button
            type="button"
            onClick={onBack}
            aria-label={t("back")}
            className="grid h-11 w-11 place-items-center rounded-full text-[#111827] transition-colors hover:bg-[#f3f4f6]"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.25} />
          </button>
          <h2 id="follow-network-title" className="truncate text-center text-base font-bold text-[#111827]">{heading}</h2>
          <span />
        </header>

        <div role="tablist" className="grid shrink-0 grid-cols-2 border-b border-[#e5e7eb]">
          {tabs.map((tab) => {
            const active = view === tab.key;
            return (
              <button
                key={tab.key}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setView(tab.key)}
                className={cn(
                  "relative h-11 text-[15px] font-semibold transition-colors",
                  active ? "text-[#111827] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#111827]" : "text-[#6b7280] hover:text-[#374151]",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="shrink-0 px-4 py-2.5">
          <label className="flex h-9 items-center gap-2 rounded-lg bg-[#eef0f2] px-3">
            <Search className="h-4 w-4 text-[#7b8490]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search")}
              className="min-w-0 flex-1 bg-transparent text-sm text-[#111827] outline-none placeholder:text-[#7b8490]"
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
          {error && (
            <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
              {error}
            </p>
          )}
          {loading ? (
            <NetworkRowsSkeleton label={t("loading")} />
          ) : items.length === 0 ? (
            <div className={cn("flex flex-col items-center justify-center text-center", conFranja ? "py-6" : "h-full min-h-[230px]")}>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#eaf7fc] text-[#009fd9]">
                <UsersRound className="h-5 w-5" strokeWidth={2} />
              </span>
              <p className="mt-3 text-sm font-semibold text-[#374151]">
                {query ? t("noResults") : view === "following" ? t("emptyFollowing") : t("emptyFollowers")}
              </p>
            </div>
          ) : (
            <ul>
              {items.map((item) => (
                <li data-follow-relation-id={item.id} key={item.id} className="flex min-h-[66px] items-center gap-3">
                  <Link href={item.slug ? `/profesionales/${item.slug}` : "#"} onClick={item.slug ? onBack : undefined} className="flex min-w-0 flex-1 items-center gap-3">
                    <Avatar className="h-11 w-11 shrink-0">
                      <AvatarImage src={item.avatarUrl ?? undefined} alt="" />
                      <AvatarFallback className="bg-[#eaf7fc] text-sm font-extrabold text-[#0089bb]">{getInitials(item.name)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="flex min-w-0 items-center text-sm font-bold leading-5 text-[#111827]">
                        <span className="truncate">{item.name}</span>
                        {item.isVerified && (
                          <CheckCircle2 aria-label={t("verified")} className="ml-1 h-3.5 w-3.5 shrink-0 text-[#009FD9]" />
                        )}
                      </span>
                      <span className="block truncate text-sm leading-5 text-[#6b7280]">{item.subtitle}</span>
                    </span>
                  </Link>
                  {view === "following" ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <DirectChatLauncher
                        professionalId={item.professionalId}
                        professionalName={item.name}
                        buttonLabel={t("message")}
                        className="h-11 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] font-bold disabled:cursor-wait"
                      />
                      <CardActionsMenu
                        label={t("moreOptions")}
                        placement="down"
                        horizontal
                        triggerClassName="w-8 border-0 text-[#111827] hover:border-0 hover:bg-transparent"
                        menuClassName="min-w-[250px] rounded-2xl py-1.5 shadow-[0_18px_45px_-18px_rgba(15,23,42,0.45)]"
                        itemClassName="px-4 py-3 text-[15px] font-medium"
                        actions={[{ label: t("unfollow"), destructive: true, icon: <UserRoundMinus className="h-5 w-5" />, onClick: () => void unfollow(item) }]}
                      />
                    </div>
                  ) : (
                    <div className="flex shrink-0 items-center gap-1">
                      {item.professionalId && <FollowButton professionalId={item.professionalId} compact />}
                      <button
                        type="button"
                        onClick={() => void removeFollower(item)}
                        disabled={busyId !== null}
                        aria-label={t("removeFollower")}
                        className="grid h-11 w-11 place-items-center rounded-full text-[#374151] transition-colors hover:bg-[#f3f4f6] disabled:opacity-60"
                      >
                        <X className="h-5 w-5" strokeWidth={2.25} />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {conFranja && (
            <section className={cn("border-t border-[#f3f4f6] pt-4", items.length > 0 && "mt-3")} aria-label={t("suggestedTitle")}>
              <h3 className="mb-1 text-[15px] font-bold text-[#111827]">{t("suggestedTitle")}</h3>
              <ul>
                {sugeridos.map((item) => (
                  <li key={item.professionalId} data-suggested-professional={item.professionalId} className="flex min-h-[66px] items-center gap-3">
                    <Link href={`/profesionales/${item.slug}`} onClick={onBack} className="flex min-w-0 flex-1 items-center gap-3">
                      <Avatar className="h-11 w-11 shrink-0">
                        <AvatarImage src={item.avatarUrl ?? undefined} alt="" />
                        <AvatarFallback className="bg-[#eaf7fc] text-sm font-extrabold text-[#0089bb]">{getInitials(item.name)}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="flex min-w-0 items-center text-sm font-bold leading-5 text-[#111827]">
                          <span className="truncate">{item.name}</span>
                          {item.isVerified && (
                            <CheckCircle2 aria-label={t("verified")} className="ml-1 h-3.5 w-3.5 shrink-0 text-[#009FD9]" />
                          )}
                        </span>
                        <span className="block truncate text-[13px] leading-5 text-[#6b7280]">{razonLabel[item.razon]}</span>
                      </span>
                    </Link>
                    <div className="flex shrink-0 items-center gap-1">
                      <FollowButton professionalId={item.professionalId} compact />
                      <button
                        type="button"
                        onClick={() => { descartados.add(item.professionalId); setDescartes((n) => n + 1); }}
                        aria-label={t("dismiss")}
                        className="grid h-11 w-8 place-items-center rounded-full text-[#374151] transition-colors hover:bg-[#f3f4f6]"
                      >
                        <X className="h-5 w-5" strokeWidth={2.25} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </section>
      {dialogNode}
    </div>
  );
}

function NetworkRowsSkeleton({ label }: { label: string }) {
  return (
    <div className="space-y-3 py-2" aria-label={label}>
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div key={item} className="flex min-h-[54px] items-center gap-3">
          <div className="h-11 w-11 animate-pulse rounded-full bg-[#eef0f2]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-32 animate-pulse rounded bg-[#eef0f2]" />
            <div className="h-3 w-44 animate-pulse rounded bg-[#eef0f2]" />
          </div>
          <div className="h-11 w-24 animate-pulse rounded-full bg-[#eef0f2]" />
        </div>
      ))}
    </div>
  );
}

function firstProfession(value: unknown, fallback: string) {
  if (Array.isArray(value) && typeof value[0] === "string" && value[0]) return value[0];
  return fallback;
}
