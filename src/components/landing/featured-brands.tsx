"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { preload } from "react-dom";
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
  // Los logos se piden desde el <head>, con la página: nunca aparecen en blanco.
  // Sin prioridad alta: nueve logos «urgentes» le quitaban la red a la foto de
  // la portada, que es lo primero que se mira.
  for (const b of FEATURED_BRANDS) preload(b.src, { as: "image" });
  const locale = useLocale();
  // Sin precargar las 9 fichas al cargar: eran 9 renders pesados a la vez y el
  // toque siguiente del usuario quedaba en cola detrás. La ficha se precarga
  // al apoyar el dedo sobre el logo (onPointerDown), que basta.
  const label = locale === "en" ? "Businesses already on ContrataCR" : "Negocios que ya están en ContrataCR";
  const marqueeRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const marquee = marqueeRef.current;
    const track = trackRef.current;
    if (!marquee || !track) return;

    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)");
    // La cinta avanza con una animación del COMPOSITOR (Web Animations), no con
    // un requestAnimationFrame que escribía el transform en cada cuadro: eso
    // ocupaba el hilo principal TODO el tiempo, aun fuera de la pantalla, y la
    // portada se sentía pesada al desplazarse (sobre todo en la app).
    const DURACION = SEGUNDOS_POR_VUELTA * 1000;
    // CADA JUEGO DE LOGOS SE MUEVE POR SU CUENTA Y SALTA SOLO CUANDO NO SE VE
    // (6-oct-2026). Antes se movía la cinta entera y, al terminar la vuelta,
    // volvía de golpe al inicio: Safari ya había descartado esa parte y tardaba
    // unos cuadros en pintarla —las marcas desaparecían un instante cada 38 s—.
    // Ahora cada juego avanza hasta salir por la izquierda y reaparece al final
    // de la fila, fuera de la pantalla; lo que se ve nunca salta.
    const juegos = Array.from(track.children) as HTMLElement[];
    const K = juegos.length;
    const DURACION_TOTAL = DURACION * K;
    let anchoJuego = 0;
    let anims: Animation[] = [];
    let enPantalla = true;
    // Estado del gesto
    let punteroId: number | null = null;
    let inicioX = 0;
    let inicioOffset = 0;
    let arrastrando = false;
    let anularClic = false;

    const medir = () => {
      anchoJuego = juegos[0] ? juegos[0].getBoundingClientRect().width : 0;
    };
    const total = () => anchoJuego * K;
    const envolver = (x: number) => (total() > 0 ? ((x % total()) + total()) % total() : 0);
    // Px desplazados hacia la izquierda según el reloj de la animación.
    const offsetActual = () => {
      const t = Number(anims[anims.length - 1]?.currentTime ?? 0);
      return total() > 0 ? ((t % DURACION_TOTAL) / DURACION_TOTAL) * total() : 0;
    };
    const irA = (offset: number) => {
      if (!anims.length || total() <= 0) return;
      const t = (envolver(offset) / total()) * DURACION_TOTAL;
      for (const a of anims) a.currentTime = t;
    };
    const decidir = () => {
      // Corre SIEMPRE, también con «Reducir movimiento» del teléfono: en esos
      // equipos la cinta se quedaba quieta y parecía rota (3-oct-2026).
      for (const a of anims) {
        if (enPantalla && !arrastrando) a.play();
        else a.pause();
      }
    };
    const mover = (px: number) => `translate3d(${px}px,0,0)`;
    const crear = () => {
      const offset = offsetActual();
      for (const a of anims) a.cancel();
      anims = [];
      medir();
      if (anchoJuego <= 0) return;
      const W = anchoJuego;
      // Cada juego recorre la fila ENTERA en línea recta —de (K-1)·W a -W— y
      // vuelve a empezar; lo único que cambia entre juegos es el desfase. Así
      // la animación es la más simple que existe (dos cuadros, lineal) y el
      // reinicio de cada juego ocurre con el juego fuera de la pantalla.
      // (Con cuadros de «salto» a mitad de animación Safari dejaba la franja vacía.)
      anims = juegos.map((juego, j) => juego.animate(
        [{ transform: mover((K - 1 - j) * W) }, { transform: mover(-(j + 1) * W) }],
        { duration: DURACION_TOTAL, iterations: Infinity, easing: "linear", delay: -(K - 1 - j) * DURACION },
      ));
      irA(offset);
      decidir();
    };

    const alBajar = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      punteroId = e.pointerId;
      inicioX = e.clientX;
      inicioOffset = offsetActual();
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
        for (const a of anims) a.pause();
      }
      irA(inicioOffset - dx);
    };
    const alSoltar = (e: PointerEvent) => {
      if (e.pointerId !== punteroId) return;
      punteroId = null;
      if (arrastrando) {
        arrastrando = false;
        marquee.classList.remove("is-dragging");
        decidir(); // retoma desde donde quedó, sin salto
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

    crear();
    let anchoVisto = anchoJuego;
    const ro = new ResizeObserver(() => {
      const w = juegos[0] ? juegos[0].getBoundingClientRect().width : 0;
      if (Math.abs(w - anchoVisto) > 0.5) { anchoVisto = w; crear(); }
    });
    if (track.firstElementChild) ro.observe(track.firstElementChild);
    // Fuera de la pantalla la cinta se detiene: no gasta nada mientras no se ve.
    const io = new IntersectionObserver(([e]) => { enPantalla = e.isIntersecting; decidir(); });
    io.observe(marquee);
    reducir.addEventListener?.("change", decidir);
    marquee.addEventListener("pointerdown", alBajar);
    marquee.addEventListener("pointermove", alMover);
    marquee.addEventListener("pointerup", alSoltar);
    marquee.addEventListener("pointercancel", alSoltar);
    marquee.addEventListener("click", alClic, true);

    return () => {
      for (const a of anims) a.cancel();
      ro.disconnect();
      io.disconnect();
      reducir.removeEventListener?.("change", decidir);
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
          // <img> directo y sin carga diferida: con <Image> los logos del borde
          // (SG Solutions, el de la derecha) se pedían tarde y salían en blanco.
          // eslint-disable-next-line @next/next/no-img-element -- logos chicos ya optimizados
          <img
            src={brand.src}
            loading="eager"
            decoding="sync"
            alt={duplicate ? "" : brand.name}
            width={500}
            height={500}
            draggable={false}
            className={`featured-brand-logo ${brand.crop}`}
          />
        );
        return brand.slug ? (
          <Link
            key={brand.name}
            href={rutaConIdioma(locale, `/profesionales/${brand.slug}`) + "?from=%2F"}
            className="featured-brand-item"
            draggable={false}
            tabIndex={duplicate ? -1 : undefined}
            data-brand-slug={brand.slug}
            // Al apoyar el dedo ya se pide la ficha: cuando se suelta, está lista.
            onPointerDown={() => router.prefetch(rutaConIdioma(locale, `/profesionales/${brand.slug}`) + "?from=%2F")}
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
