"use client";

import type { ProfessionalOffer } from "@/lib/offers";
import { cldLarge } from "@/lib/cloudinary";
import { ProgressiveImage } from "@/components/ui/progressive-image";
import { ProfilePhotoPreview } from "@/components/ui/profile-photo-preview";

export function OfferThumbnail({
  offer,
  large = false,
  priority = false,
  eager = false,
}: {
  offer: ProfessionalOffer;
  large?: boolean;
  priority?: boolean;
  eager?: boolean;
}) {
  const extraCount = Math.max(0, offer.image_urls.length - 1);
  return (
    <div
      className={`${large ? "aspect-[16/8] w-full rounded-lg bg-white" : "h-11 w-11 shrink-0 sm:h-12 sm:w-12"} relative overflow-hidden`}
    >
      {offer.image_urls[0] ? (
        <ProgressiveImage
          src={cldLarge(offer.image_urls[0], 640)}
          alt={offer.title}
          fit="cover"
          priority={priority}
          loading={priority || eager ? "eager" : "lazy"}
          preview={false}
          wrapperClassName="block h-full max-h-full w-full max-w-full rounded-lg"
          className="rounded-lg"
        />
      ) : offer.professional_avatar_url ? (
        // Sin arte propio, la cara de quien la ofrece: 250 de 290 profesionales
        // tienen foto, y dice mucho más que dos letras del título. La foto del
        // profesional NO se agrega cuando la promoción sí trae su imagen: ahí
        // manda el arte, que es lo que se compra con los ojos.
        <ProfilePhotoPreview priority={priority} eager={eager} src={offer.professional_avatar_url} name={offer.professional_name ?? ""} className="h-full w-full" square />
      ) : (
        <span className="grid h-full place-items-center rounded-lg bg-[#f3f7fa] text-xs font-extrabold text-[#009fd9]">
          {offer.title.slice(0, 2).toUpperCase()}
        </span>
      )}
      {extraCount > 0 && (
        <span className="absolute bottom-1 right-1 rounded-full bg-[#162543]/85 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white">
          +{extraCount}
        </span>
      )}
    </div>
  );
}
