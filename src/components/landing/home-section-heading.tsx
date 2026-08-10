import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";

type HomeSectionHeadingProps = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  linkLabel?: string;
};

export function HomeSectionHeading({
  id,
  title,
  subtitle,
  href,
  linkLabel = "Ver más",
}: HomeSectionHeadingProps) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 sm:mb-6 sm:items-center">
      <div className="min-w-0 sm:flex sm:items-baseline sm:gap-2.5">
        <h2 id={id} className="text-[1.4rem] font-extrabold leading-tight text-[#10213e] sm:text-3xl">
          {title}
        </h2>
        <p className="mt-1 text-sm font-semibold leading-snug text-[#008fbd] sm:mt-0 sm:text-[15px]">
          {subtitle}
        </p>
      </div>
      <Link
        href={href}
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-[#009fd9] px-3 text-xs font-bold text-white transition-colors hover:bg-[#0088bb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009fd9] focus-visible:ring-offset-2 sm:h-9 sm:px-3.5 sm:text-sm"
      >
        {linkLabel}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
