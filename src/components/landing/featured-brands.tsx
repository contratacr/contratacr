import Image from "next/image";
import { getLocale } from "next-intl/server";

const FEATURED_BRANDS = [
  { name: "TECNOCLIMA", src: "/featured-brands/tecnoclima.webp", crop: "featured-brand-logo--tecnoclima" },
  { name: "SG Solutions", src: "/featured-brands/sg-solutions.webp", crop: "featured-brand-logo--sg" },
  { name: "Terapia Física Andrés Arguedas Guerrero", src: "/featured-brands/terapia-fisica.webp", crop: "featured-brand-logo--terapia" },
  { name: "EasySA Consultoría", src: "/featured-brands/easysa.webp", crop: "featured-brand-logo--easysa" },
  { name: "BH Legal", src: "/featured-brands/bh-legal.webp", crop: "featured-brand-logo--bh" },
  { name: "Ley Total Abogados", src: "/featured-brands/ley-total-abogados.webp", crop: "featured-brand-logo--ley-total" },
  { name: "J Logo", src: "/featured-brands/j-logo.webp", crop: "featured-brand-logo--j" },
  { name: "+Kotas Pet Shop", src: "/featured-brands/kotas-pet-shop.webp", crop: "featured-brand-logo--kotas" },
  { name: "Titanium Fitness", src: "/featured-brands/t-corporate-logo.webp", crop: "featured-brand-logo--titanium" },
] as const;

export async function FeaturedBrands() {
  const locale = await getLocale();
  const label = locale === "en" ? "Featured businesses on ContrataCR" : "Negocios destacados en ContrataCR";

  return (
    <section className="featured-brands-ribbon" aria-label={label}>
      <div className="featured-brands-marquee">
        <div className="featured-brands-track">
          <BrandSet />
          <BrandSet duplicate />
          <BrandSet duplicate />
          <BrandSet duplicate />
        </div>
      </div>
    </section>
  );
}

function BrandSet({ duplicate = false }: { duplicate?: boolean }) {
  return (
    <div className="featured-brands-set" aria-hidden={duplicate || undefined}>
      {FEATURED_BRANDS.map((brand) => (
        <div key={brand.name} className="featured-brand-item">
          <Image
            src={brand.src}
            alt={duplicate ? "" : brand.name}
            width={500}
            height={500}
            className={`featured-brand-logo ${brand.crop}`}
            sizes="(max-width: 640px) 112px, 144px"
          />
        </div>
      ))}
    </div>
  );
}
