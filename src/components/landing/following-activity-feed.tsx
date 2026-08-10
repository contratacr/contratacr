import { BriefcaseBusiness, Images, Sparkles, Wrench } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { cldThumb } from "@/lib/cloudinary";
import { HomeSectionHeading } from "@/components/landing/home-section-heading";

type ActivityRow = {
  id: string;
  activity_type: "success_case" | "service" | "offer" | "job";
  title: string;
  summary: string | null;
  image_url: string | null;
  href: string;
  created_at: string;
  professionals: {
    business_name: string | null;
    slug: string;
    profiles: { full_name: string | null; avatar_url: string | null } | null;
  } | null;
};

const activityLabel = {
  success_case: "Nuevo caso de éxito",
  service: "Nuevo servicio",
  offer: "Nueva oferta",
  job: "Nueva oportunidad",
} as const;

function ActivityIcon({ type }: { type: ActivityRow["activity_type"] }) {
  const className = "h-4 w-4";
  if (type === "success_case") return <Images className={className} />;
  if (type === "service") return <Wrench className={className} />;
  if (type === "job") return <BriefcaseBusiness className={className} />;
  return <Sparkles className={className} />;
}

function relativeDate(value: string) {
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
  if (days === 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return `Hace ${days} días`;
  return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short" }).format(new Date(value));
}

export async function FollowingActivityFeed() {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) return null;

  const { data, error } = await supabase
    .from("professional_activity")
    .select("id,activity_type,title,summary,image_url,href,created_at,professionals(business_name,slug,profiles(full_name,avatar_url))")
    .order("created_at", { ascending: false })
    .limit(12);

  if (error || !data?.length) return null;
  const activities = data as unknown as ActivityRow[];

  return (
    <section className="bg-[#f4f7fa] py-9 sm:py-12" aria-labelledby="following-updates-title">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <HomeSectionHeading
          id="following-updates-title"
          title="Novedades de quienes sigues"
          subtitle="Mirá las publicaciones más recientes de tu red."
          href="/dashboard/profesional?tab=network&network=following"
        />

        <div className="flex snap-x gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
          {activities.map((activity) => {
            const profile = activity.professionals?.profiles;
            const name = activity.professionals?.business_name?.trim() || profile?.full_name?.trim() || "Profesional";
            const image = activity.image_url || profile?.avatar_url;
            return (
              <Link
                key={activity.id}
                href={activity.href}
                className="group min-w-[280px] max-w-[340px] flex-1 snap-start overflow-hidden rounded-xl border border-[#dfe7ef] bg-white shadow-[0_10px_28px_-24px_rgba(15,35,65,0.75)] transition hover:-translate-y-0.5 hover:border-[#bcddeb] hover:shadow-[0_16px_34px_-25px_rgba(15,35,65,0.8)]"
              >
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cldThumb(image, 720)} alt="" className="h-36 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid h-28 place-items-center bg-[#eef7fb] text-[#009fd9]">
                    <ActivityIcon type={activity.activity_type} />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase text-[#008fbd]">
                    <ActivityIcon type={activity.activity_type} />
                    <span>{activityLabel[activity.activity_type]}</span>
                    <span className="ml-auto font-medium normal-case text-[#7b8798]">{relativeDate(activity.created_at)}</span>
                  </div>
                  <p className="mt-2 truncate text-sm font-semibold text-[#40506a]">{name}</p>
                  <h3 className="mt-1 line-clamp-2 text-base font-bold leading-snug text-[#10213e]">{activity.title}</h3>
                  {activity.summary && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[#667085]">{activity.summary}</p>}
                  <span className="mt-3 inline-block text-sm font-semibold text-[#009fd9] group-hover:underline">Ver publicación</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
