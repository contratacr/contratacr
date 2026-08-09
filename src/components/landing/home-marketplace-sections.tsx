import { CalendarDays, MapPin } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { EMPLOYMENT_TYPES, formatJobSalary, type JobPost, WORKPLACE_TYPES } from "@/lib/jobs";
import { formatOfferPrice, OFFER_TYPES, type ProfessionalOffer } from "@/lib/offers";
import { repairVisibleText } from "@/lib/text/repair-visible-text";
import { HomeSectionHeading } from "@/components/landing/home-section-heading";
import { safeGetUser } from "@/lib/supabase/get-user";
import { crTodayISO } from "@/lib/time-cr";

export async function HomeMarketplaceSections() {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const today = crTodayISO();
  const [jobsResult, offersResult, followsResult] = await Promise.all([
    supabase
      .from("job_posts")
      .select("*, professionals!job_posts_employer_id_fkey(business_name,profiles(full_name,avatar_url))")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(24),
    supabase
      .from("professional_offers")
      .select("*, professionals!professional_offers_professional_id_fkey(business_name,profiles(full_name))")
      .eq("status", "published")
      .or(`valid_until.is.null,valid_until.gte.${today}`)
      .order("created_at", { ascending: false })
      .limit(24),
    user
      ? supabase.from("professional_follows").select("professional_id").eq("follower_id", user.id)
      : Promise.resolve({ data: [] as Array<{ professional_id: string }> }),
  ]);

  const followedProfessionalIds = new Set(
    (followsResult.data ?? []).map((row) => row.professional_id),
  );

  const jobs = prioritizeFollowed(
    ((jobsResult.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const employer = row.professionals as {
      business_name?: string | null;
      profiles?: { full_name?: string | null; avatar_url?: string | null } | null;
    } | null;
    return {
      ...row,
      title: repairVisibleText(String(row.title ?? "")),
      description: repairVisibleText(String(row.description ?? "")),
      employer_name: repairVisibleText(employer?.business_name || employer?.profiles?.full_name || "Profesional en ContrataCR"),
      employer_avatar_url: employer?.profiles?.avatar_url ?? null,
      } as JobPost & { employer_avatar_url?: string | null };
    }),
    (job) => job.employer_id,
    followedProfessionalIds,
  );

  const offers = prioritizeFollowed(
    ((offersResult.data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const professional = row.professionals as { business_name?: string | null; profiles?: { full_name?: string | null } | null } | null;
    return {
      ...row,
      title: repairVisibleText(String(row.title ?? "")),
      description: repairVisibleText(String(row.description ?? "")),
      service_label: row.service_label ? repairVisibleText(String(row.service_label)) : null,
      location_label: row.location_label ? repairVisibleText(String(row.location_label)) : null,
      image_urls: Array.isArray(row.image_urls) ? row.image_urls : [],
      professional_name: repairVisibleText(professional?.business_name || professional?.profiles?.full_name || "Profesional en ContrataCR"),
      } as ProfessionalOffer;
    }),
    (offer) => offer.professional_id,
    followedProfessionalIds,
  );

  if (!jobs.length && !offers.length) return null;

  return (
    <div>
      {offers.length > 0 && (
        <section className="bg-white py-10 sm:py-14" aria-labelledby="home-offers-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <HomeSectionHeading
              id="home-offers-title"
              title="Ofertas recientes"
              subtitle="Aprovechá promociones de profesionales en Costa Rica."
              href="/ofertas"
            />
            <HorizontalRail>
              {offers.map((offer) => (
                <Link key={offer.id} href={`/ofertas/${offer.id}`} className="group flex w-[82vw] max-w-[360px] shrink-0 gap-3 rounded-lg border border-[#dfe8f0] bg-white p-4 transition hover:border-[#9bdcf2] hover:shadow-[0_14px_35px_-27px_rgba(15,23,42,0.65)] sm:w-[340px]">
                  <CompactThumb src={offer.image_urls[0]} label={offer.title} />
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-2 font-bold leading-snug group-hover:text-[#008fc3]">{offer.title}</h3>
                    <p className="mt-1 truncate text-sm text-[#60708a]">{offer.professional_name}</p>
                    {followedProfessionalIds.has(offer.professional_id) && (
                      <p className="mt-1 text-xs font-semibold text-[#008fbd]">De alguien que sigues</p>
                    )}
                    <p className="mt-2 truncate text-base font-extrabold text-[#007fae]">{formatOfferPrice(offer)}</p>
                    <p className="mt-1 truncate text-xs font-semibold text-[#68778d]">{offer.service_label || OFFER_TYPES[offer.offer_type]}</p>
                  </div>
                </Link>
              ))}
            </HorizontalRail>
          </div>
        </section>
      )}

      {jobs.length > 0 && (
        <section className="bg-[#f4f7fa] py-10 sm:py-14" aria-labelledby="home-jobs-title">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <HomeSectionHeading
              id="home-jobs-title"
              title="Empleos recientes"
              subtitle="Descubrí nuevas oportunidades laborales en Costa Rica."
              href="/empleos"
            />
            <HorizontalRail>
              {jobs.map((job) => (
                <Link key={job.id} href={`/empleos/${job.id}`} className="group flex w-[84vw] max-w-[420px] shrink-0 gap-3 rounded-lg border border-[#dfe8f0] bg-white p-4 transition hover:border-[#9bdcf2] sm:w-[390px]">
                  <CompactThumb src={job.employer_avatar_url} label={job.employer_name ?? job.title} rounded="full" />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold group-hover:text-[#008fc3]">{job.title}</h3>
                    <p className="mt-0.5 truncate text-sm font-semibold text-[#52627a]">{job.employer_name}</p>
                    {followedProfessionalIds.has(job.employer_id) && (
                      <p className="mt-1 text-xs font-semibold text-[#008fbd]">De alguien que sigues</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#68778d]">
                      <span>{EMPLOYMENT_TYPES[job.employment_type]}</span>
                      <span>{WORKPLACE_TYPES[job.workplace_type]}</span>
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-[#009fd9]" />
                        <span className="truncate">{job.workplace_type === "remote" ? "Costa Rica" : job.location_label}</span>
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="truncate font-extrabold text-[#007fae]">{formatJobSalary(job)}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-[#7a899d]"><CalendarDays className="h-3.5 w-3.5" />Reciente</span>
                    </div>
                  </div>
                </Link>
              ))}
            </HorizontalRail>
          </div>
        </section>
      )}
    </div>
  );
}

function prioritizeFollowed<T extends { created_at: string }>(
  items: T[],
  professionalId: (item: T) => string,
  followedIds: Set<string>,
) {
  const FOLLOWING_RECENCY_BOOST_MS = 7 * 24 * 60 * 60 * 1000;

  return [...items]
    .sort((a, b) => {
      const scoreA = new Date(a.created_at).getTime() + (followedIds.has(professionalId(a)) ? FOLLOWING_RECENCY_BOOST_MS : 0);
      const scoreB = new Date(b.created_at).getTime() + (followedIds.has(professionalId(b)) ? FOLLOWING_RECENCY_BOOST_MS : 0);
      return scoreB - scoreA;
    })
    .slice(0, 8);
}

function HorizontalRail({ children }: { children: ReactNode }) {
  return <div className="-mx-4 mt-5 flex gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 [&::-webkit-scrollbar]:hidden">{children}</div>;
}

function initials(value?: string | null) {
  const clean = repairVisibleText(value ?? "").trim();
  return clean
    .split(/\s+/u)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "CR";
}

function CompactThumb({
  src,
  label,
  rounded = "md",
}: {
  src?: string | null;
  label?: string | null;
  rounded?: "md" | "full";
}) {
  const radius = rounded === "full" ? "rounded-full" : "rounded-md";
  return (
    <span className={`grid h-12 w-12 shrink-0 place-items-center overflow-hidden ${radius} bg-[#eaf7fc] text-xs font-extrabold text-[#009fd9]`}>
      {src ? <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials(label)}
    </span>
  );
}
