"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";

/**
 * `slug` es la ficha pública (/profesionales/<slug>). Sin slug el logo no lleva
 * enlace: J y Titanium Fitness no tienen todavía una ficha identificada.
 * SG Solutions existe en producción pero no en la copia de test.
 */
const FEATURED_BRANDS: ReadonlyArray<{ name: string; src: string; crop: string; slug?: string }> = [
  { name: "TECNOCLIMA", src: "/featured-brands/tecnoclima.webp", crop: "featured-brand-logo--tecnoclima", slug: "jose-martin-retana-artavia-0b5ar70n" },
  { name: "SG Solutions", src: "/featured-brands/sg-solutions.webp", crop: "featured-brand-logo--sg", slug: "luis-angel-sanchez-sibaja-977u5iku" },
  { name: "Terapia Física Andrés Arguedas Guerrero", src: "/featured-brands/terapia-fisica.webp", crop: "featured-brand-logo--terapia", slug: "andres-gustavo-arguedas-guerrero-1ed875tq" },
  { name: "EasySA Consultoría", src: "/featured-brands/easysa.webp", crop: "featured-brand-logo--easysa", slug: "luis-josue-sanchez-monge-nxd5gjfc" },
  { name: "BH Legal", src: "/featured-brands/bh-legal.webp", crop: "featured-brand-logo--bh", slug: "rolan-francisco-munoz-rodriguez-fhq3emee" },
  { name: "Ley Total Abogados", src: "/featured-brands/ley-total-abogados.webp", crop: "featured-brand-logo--ley-total", slug: "luis-gerardo-suarez-chaves-54xrmtku" },
  { name: "English Program", src: "/featured-brands/j-logo.webp", crop: "featured-brand-logo--j", slug: "jafeth-perez-umana-n80rvcg4" },
  { name: "+Kotas Pet Shop", src: "/featured-brands/kotas-pet-shop.webp", crop: "featured-brand-logo--kotas", slug: "jesus-alberto-ramirez-suarez-z5kel78z" },
  { name: "Titanium Fitness", src: "/featured-brands/t-corporate-logo.webp", crop: "featured-brand-logo--titanium", slug: "adrian-francisco-chaves-benavides-mqh45m18" },
];

/** Segundos que tarda un juego completo de logos en pasar (igual que la animación CSS anterior). */
const SEGUNDOS_POR_VUELTA = 38;
/** Px que hay que mover el dedo para que cuente como arrastre y no como toque. */
const UMBRAL_ARRASTRE = 6;

export function FeaturedBrands() {
  const locale = useLocale();
  const routerMarcas = useRouter();
  // Las fichas de las marcas se piden en segundo plano apenas carga la portada:
  // al tocar un logo la ficha ya está lista y abre al instante.
  useEffect(() => {
    const id = window.setTimeout(() => {
      for (const b of FEATURED_BRANDS) if (b.slug) routerMarcas.prefetch(rutaConIdioma(locale, `/profesionales/${b.slug}`));
    }, 1200);
    return () => window.clearTimeout(id);
  }, [locale, routerMarcas]);
  const label = locale === "en" ? "Businesses already on ContrataCR" : "Negocios que ya están en ContrataCR";
  const marqueeRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marquee = marqueeRef.current;
    const track = trackRef.current;
    if (!marquee || !track) return;

    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)");
    let offset = 0; // px desplazados hacia la izquierda, siempre en [0, ancho de un juego)
    let anchoJuego = 0;
    let ultimo = performance.now();
    let frame = 0;
    // Estado del gesto
    let punteroId: number | null = null;
    let inicioX = 0;
    let inicioOffset = 0;
    let arrastrando = false;
    let anularClic = false;

    const medir = () => {
      const juego = track.firstElementChild as HTMLElement | null;
      anchoJuego = juego ? juego.getBoundingClientRect().width : 0;
    };
    const envolver = (x: number) => (anchoJuego > 0 ? ((x % anchoJuego) + anchoJuego) % anchoJuego : 0);
    const pintar = () => {
      track.style.transform = `translate3d(${-offset}px, 0, 0)`;
    };

    const paso = (ahora: number) => {
      const dt = Math.min(ahora - ultimo, 100);
      ultimo = ahora;
      if (!arrastrando && !reducir.matches && anchoJuego > 0) {
        offset = envolver(offset + (anchoJuego / (SEGUNDOS_POR_VUELTA * 1000)) * dt);
        pintar();
      }
      frame = requestAnimationFrame(paso);
    };

    const alBajar = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      punteroId = e.pointerId;
      inicioX = e.clientX;
      inicioOffset = offset;
      arrastrando = false;
      anularClic = false;
    };
    const alMover = (e: PointerEvent) => {
      if (e.pointerId !== punteroId) return;
      const dx = e.clientX - inicioX;
      if (!arrastrando) {
        if (Math.abs(dx) < UMBRAL_ARRASTRE) return;
        arrastrando = true;
        anularClic = true;
        try { marquee.setPointerCapture(e.pointerId); } catch { /* ya liberado */ }
        marquee.classList.add("is-dragging");
      }
      offset = envolver(inicioOffset - dx);
      pintar();
    };
    const alSoltar = (e: PointerEvent) => {
      if (e.pointerId !== punteroId) return;
      punteroId = null;
      if (arrastrando) {
        arrastrando = false;
        marquee.classList.remove("is-dragging");
        ultimo = performance.now(); // retoma desde donde quedó, sin salto
      }
    };
    // Un arrastre no debe abrir la ficha que quedó bajo el dedo al soltar.
    const alClic = (e: MouseEvent) => {
      if (anularClic) {
        e.preventDefault();
        e.stopPropagation();
        anularClic = false;
      }
    };

    medir();
    pintar();
    const ro = new ResizeObserver(() => { medir(); offset = envolver(offset); pintar(); });
    if (track.firstElementChild) ro.observe(track.firstElementChild);
    marquee.addEventListener("pointerdown", alBajar);
    marquee.addEventListener("pointermove", alMover);
    marquee.addEventListener("pointerup", alSoltar);
    marquee.addEventListener("pointercancel", alSoltar);
    marquee.addEventListener("click", alClic, true);
    frame = requestAnimationFrame(paso);

    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      marquee.removeEventListener("pointerdown", alBajar);
      marquee.removeEventListener("pointermove", alMover);
      marquee.removeEventListener("pointerup", alSoltar);
      marquee.removeEventListener("pointercancel", alSoltar);
      marquee.removeEventListener("click", alClic, true);
    };
  }, []);

  return (
    <section className="featured-brands-ribbon" aria-label={label}>
      <div ref={marqueeRef} className="featured-brands-marquee">
        <div ref={trackRef} className="featured-brands-track">
          <BrandSet locale={locale} />
          <BrandSet locale={locale} duplicate />
          <BrandSet locale={locale} duplicate />
          <BrandSet locale={locale} duplicate />
        </div>
      </div>
    </section>
  );
}

function BrandSet({ locale, duplicate = false }: { locale: string; duplicate?: boolean }) {
  const router = useRouter();
  return (
    <div className="featured-brands-set" aria-hidden={duplicate || undefined}>
      {FEATURED_BRANDS.map((brand) => {
        const logo = (
          <Image
            src={brand.src}
            alt={duplicate ? "" : brand.name}
            width={500}
            height={500}
            draggable={false}
            className={`featured-brand-logo ${brand.crop}`}
            sizes="(max-width: 640px) 112px, 144px"
          />
        );
        return brand.slug ? (
          <Link
            key={brand.name}
            href={rutaConIdioma(locale, `/profesionales/${brand.slug}`)}
            className="featured-brand-item"
            draggable={false}
            tabIndex={duplicate ? -1 : undefined}
            data-brand-slug={brand.slug}
            // Al apoyar el dedo ya se pide la ficha: cuando se suelta, está lista.
            onPointerDown={() => router.prefetch(rutaConIdioma(locale, `/profesionales/${brand.slug}`))}
          >
            {logo}
          </Link>
        ) : (
          <div key={brand.name} className="featured-brand-item">
            {logo}
          </div>
        );
      })}
    </div>
  );
}
