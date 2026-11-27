"use client";
import type { ReactNode } from "react";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { profileIdentityAvatarClass } from "@/components/professionals/profile-identity-name";
import { r2Large, r2Thumb } from "@/lib/r2-image-url";

/**
 * Hero of the professional profile while the directory is on (2026-11-26 redesign, owner «rediseña los perfiles …
 * fíjese cómo lo hace Yelp … un rediseño completo»; same language as the place page /lugar/<slug>):
 * - a cover band: the first «caso de éxito» photo when there is one; otherwise the pro's own photo, blurred under a
 *   navy veil with the brand glow (never a stock image or a giant icon);
 * - the round avatar overlapping the cover with a white ring (same 72/88 px box as the account panel, so the
 *   identity-consistency checks keep holding), the name heading passed in (ProfileIdentityName, same sizes), the
 *   trade and zone line, the stats row and, on phones, the contact block (price, zones, links; the actions live in
 *   the sticky bottom strip). The «…» sits on the name row from lg.
 * With the directory off (production) this component is not rendered: the classic header card stays.
 */
export function ProfileHero({
  avatarUrl, coverUrl, initials, altName, name, subtitle, stats, menu, contact, en,
}: {
  avatarUrl?: string | null;
  coverUrl?: string | null;
  initials: string;
  altName: string;
  name: ReactNode;
  subtitle?: ReactNode;
  stats?: ReactNode;
  menu?: ReactNode;
  contact?: ReactNode;
  en: boolean;
}) {
  const avatar = avatarUrl ? r2Thumb(avatarUrl, 320) : null;
  const cover = coverUrl ? r2Large(coverUrl, 1280) : null;
  return (
    <div data-pro-hero className="relative -mx-4 mb-4 max-sm:-mt-4 overflow-hidden bg-white sm:mx-0 sm:mb-6 sm:rounded-2xl sm:border sm:border-[#e5e9ee] sm:shadow-[0_8px_30px_rgba(22,37,67,0.06)]">
      <div aria-hidden="true" className="relative h-28 overflow-hidden bg-[#162543] sm:h-44 lg:h-52">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- decorative cover, same image helper as the gallery
          <img src={cover} alt="" decoding="async" fetchPriority="high" className="h-full w-full object-cover" />
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- the avatar request itself (cached), blurred as a backdrop */}
            {avatar && <img src={avatar} alt="" decoding="async" className="absolute inset-0 h-full w-full scale-150 object-cover opacity-35 blur-2xl saturate-150" />}
            <div className="absolute inset-0 bg-[radial-gradient(90%_140%_at_100%_0%,rgba(0,159,217,0.55),transparent_60%),radial-gradient(70%_120%_at_0%_100%,rgba(0,131,176,0.35),transparent_60%)]" />
            <div className="absolute inset-0 opacity-[0.07] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:14px_14px]" />
          </>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1424]/45 to-transparent" />
      </div>
      <div className="relative px-4 pb-4 sm:px-6 sm:pb-6 lg:px-8">
        <div className="flex items-end justify-between gap-3">
          <ImagePreviewDialog
            src={avatarUrl ?? undefined}
            alt={altName}
            openLabel={en ? "View profile photo" : "Ver foto de perfil"}
            closeLabel={en ? "Close" : "Cerrar"}
            className="-mt-10 shrink-0 rounded-full bg-white p-1 shadow-[0_6px_20px_rgba(22,37,67,0.18)] sm:-mt-12"
          >
            <span data-profile-identity-avatar className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#EBF5FB] ${profileIdentityAvatarClass}`}>
              {!avatar && <span aria-hidden className="text-xl font-bold text-[#009FD9] sm:text-2xl">{initials}</span>}
              {/* eslint-disable-next-line @next/next/no-img-element -- server-painted avatar, same as the classic header */}
              {avatar && <img src={avatar} alt={altName} loading="eager" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full bg-white object-cover" />}
            </span>
          </ImagePreviewDialog>
          {menu && <div className="hidden pb-1 lg:block">{menu}</div>}
        </div>
        {/* Below 360 px the name keeps the same measure as the account panel (it wraps at the same word). */}
        <div className="mt-3 min-w-0 max-[359px]:pr-8" data-verification-owner>{name}</div>
        {subtitle && <div className="mt-1 text-[13.5px] font-semibold leading-snug text-[#5f6f86] sm:text-[14px]">{subtitle}</div>}
        {stats && <div className="mt-3">{stats}</div>}
        {contact && <div className="mt-4 rounded-2xl bg-[#f5fafd] p-4 ring-1 ring-[#e3eff6] lg:hidden">{contact}</div>}
      </div>
    </div>
  );
}
