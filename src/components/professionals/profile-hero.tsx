"use client";
import type { ReactNode } from "react";
import { ImagePreviewDialog } from "@/components/ui/image-preview-dialog";
import { profileIdentityAvatarClass } from "@/components/professionals/profile-identity-name";
import { r2Thumb } from "@/lib/r2-image-url";

/**
 * Hero of the professional profile while the directory is on (2026-11-26 redesign, owner «rediseña los perfiles …
 * fíjese cómo lo hace Yelp … un rediseño completo»; same language as the place page /lugar/<slug>):
 * - ONE photo only (owner 2026-11-26, like production): the round avatar, no cover band; the casos de éxito
 *   have their own tab;
 * - the round avatar (same 72/88 px box as the account panel, so the
 *   identity-consistency checks keep holding), the name heading passed in (ProfileIdentityName, same sizes), the
 *   trade and zone line, the stats row and, on phones, the contact block (price, zones, links; the actions live in
 *   the sticky bottom strip). The «…» sits on the name row from lg.
 * With the directory off (production) this component is not rendered: the classic header card stays.
 */
export function ProfileHero({
  avatarUrl, initials, altName, name, subtitle, stats, facts, menu, contact, en,
}: {
  avatarUrl?: string | null;
  initials: string;
  altName: string;
  name: ReactNode;
  subtitle?: ReactNode;
  stats?: ReactNode;
  facts?: ReactNode;
  menu?: ReactNode;
  contact?: ReactNode;
  en: boolean;
}) {
  const avatar = avatarUrl ? r2Thumb(avatarUrl, 320) : null;
  return (
    <div data-pro-hero className="relative mb-2 pt-3 sm:pt-6">
      {/* Airbnb-style card (owner 2026-11-26): centred photo, name, trade and zone, three big numbers. */}
      <div className="relative mx-auto max-w-md rounded-3xl bg-white px-5 pb-5 pt-6 text-center shadow-[0_10px_36px_-12px_rgba(22,37,67,0.25)] ring-1 ring-[#eef2f6]">
        {menu && <div className="absolute right-3 top-3 hidden lg:block">{menu}</div>}
        <ImagePreviewDialog
          src={avatarUrl ?? undefined}
          alt={altName}
          openLabel={en ? "View profile photo" : "Ver foto de perfil"}
          closeLabel={en ? "Close" : "Cerrar"}
          className="mx-auto block w-fit rounded-full"
        >
          <span data-profile-identity-avatar className={`relative mx-auto grid shrink-0 place-items-center overflow-hidden rounded-full bg-[#EBF5FB] ${profileIdentityAvatarClass}`}>
            {!avatar && <span aria-hidden className="text-xl font-bold text-[#009FD9] sm:text-2xl">{initials}</span>}
            {/* eslint-disable-next-line @next/next/no-img-element -- server-painted avatar, same as the classic header */}
            {avatar && <img src={avatar} alt={altName} loading="eager" fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full bg-white object-cover" />}
          </span>
        </ImagePreviewDialog>
        <div className="mt-3 flex min-w-0 justify-center [&_h1]:text-center" data-verification-owner>{name}</div>
        {subtitle && <div className="mt-1 text-[13.5px] font-semibold leading-snug text-[#5f6f86] sm:text-[14px]">{subtitle}</div>}
        {stats && <div className="mt-2 flex justify-center">{stats}</div>}
        {facts && <div className="mt-5">{facts}</div>}
      </div>
      {contact && <div className="mx-auto mt-4 max-w-md lg:hidden">{contact}</div>}
    </div>
  );
}
