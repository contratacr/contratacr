import { formatOfferPrice, type ProfessionalOffer } from "@/lib/offers";
import { offerTypeLabel, type MarketplaceLocale } from "@/lib/marketplace-copy";

// Lo que se guarda de una promoción, para pintarla en Favoritos sin ir a
// buscarla. Vive fuera del tablero porque también lo usa la ficha, que es una
// página de servidor: importarlo de un módulo de cliente devolvía una
// referencia en vez de la función.
export function offerSaveSnapshot(offer: ProfessionalOffer, locale: MarketplaceLocale) {
  return {
    title: offer.title,
    professional_name: offer.professional_name,
    professional_slug: offer.professional_slug,
    image_url: offer.image_urls[0] ?? null,
    // Respaldo cuando la oferta no trae foto: la cara del profesional dice
    // bastante más que un icono de etiqueta.
    professional_avatar_url: offer.professional_avatar_url ?? null,
    service_label: offer.service_label,
    offer_type: offerTypeLabel(offer.offer_type, locale),
    location_label: offer.location_label,
    price: formatOfferPrice(offer, locale),
    created_at: offer.created_at,
  };
}
