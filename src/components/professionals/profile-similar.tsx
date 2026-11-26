import { MapPin, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { r2Thumb } from "@/lib/r2-image-url";

/**
 * «Profesionales similares» at the end of the professional profile (directory on only, 2026-11-26 redesign; the
 * professional twin of «Lugares similares cerca»). Same trade, best first, the profile itself left out; computed on
 * the server (page.tsx) from the public search so nothing here is invented. Phones: a sideways rail; from sm a grid.
 */
export type SimilarPro = {
  slug: string;
  name: string;
  avatarUrl: string | null;
  trade: string;
  area: string;
  ratingAvg: number;
  reviewCount: number;
  verified: boolean;
};

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]?.toUpperCase() ?? "").join("");

export function ProfileSimilar({ pros, en }: { pros: SimilarPro[]; en: boolean }) {
  if (!pros.length) return null;
  return (
    <section aria-labelledby="pro-similar" data-pro-similar={pros.length} className="mt-10 space-y-4 border-t border-[#eef2f6] pt-8">
      <h2 id="pro-similar" className="text-xl font-extrabold tracking-tight text-[#162543] sm:text-2xl">{en ? "Similar professionals" : "Profesionales similares"}</h2>
      <ul className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {pros.map((p) => (
          <li key={p.slug} className="w-[78%] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none">
            <Link href={`/profesionales/${p.slug}`} prefetch={false} data-pro-similar-card={p.slug}
              className="group flex h-full items-center gap-3 rounded-2xl border border-[#e5e9ee] bg-white p-4 transition-shadow hover:shadow-[0_8px_24px_rgba(22,37,67,0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009FD9]">
              <span aria-hidden="true" className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#EBF5FB] text-[15px] font-bold text-[#009FD9]">
                {p.avatarUrl
                  // eslint-disable-next-line @next/next/no-img-element -- small avatar thumbnail
                  ? <img src={r2Thumb(p.avatarUrl, 160)} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full bg-white object-cover" />
                  : initials(p.name)}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1">
                  <span className="truncate text-[15px] font-bold text-[#111827] group-hover:text-[#0083b0]">{p.name}</span>
                  {p.verified && <VerifiedSeal className="h-4 w-4 shrink-0 text-[#009FD9]" label={en ? "Verified" : "Verificado"} />}
                </span>
                {p.trade && <span className="truncate text-[12.5px] font-semibold text-[#6b7280]">{p.trade}</span>}
                <span className="flex min-w-0 items-center gap-2 text-[12.5px] text-[#68778d]">
                  {p.reviewCount > 0 && <span className="inline-flex shrink-0 items-center gap-1"><Star aria-hidden="true" className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]" /><span className="font-bold text-[#162543]">{p.ratingAvg.toFixed(1)}</span>({p.reviewCount})</span>}
                  {p.area && <span className="flex min-w-0 items-center gap-1"><MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{p.area}</span></span>}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
