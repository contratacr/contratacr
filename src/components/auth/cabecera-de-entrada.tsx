"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { CabeceraDeTramite } from "@/components/layout/focused-header";
import { SectionHeaderTitle } from "@/components/mobile/section-header-title";
import { useSiteFeatures } from "@/components/site-features";
import { rutaInternaSegura } from "@/lib/navigation/ruta-interna";
import { hayPantallaAnterior, salirDelFlujoDeEntrada, volverHastaSalir } from "@/lib/volver-por-historial";

/**
 * SIGN-IN AS AN INTERRUPTION (owner 2026-11-27, Airbnb/Yelp/Uber; Apple HIG modal, Material full-screen dialog).
 * Directory on only — with the directory off (production) every sign-in screen keeps the site bar, exactly as before.
 *
 *  - Reached from a gated section (`?redirect=` present): on phones the first screen is a full-screen dialog,
 *    «X Iniciar sesión» with no logo, menu or search. X closes the WHOLE flow and returns to the screen before the gated
 *    section (never the gated address: it would bounce back here); with nothing behind, home.
 *  - Steps inside the flow (Crear cuenta, Recuperar contraseña, the e-mail code, the kind of professional) carry
 *    «← paso»: one step back. X only on the first screen, so each glyph has one meaning (X leaves, ← goes back).
 *  - Opened directly (menu «Ingresar»): a root screen with the site bar; when an in-app screen is behind it, the bar
 *    becomes «← Iniciar sesión». That is only known in the browser, so that bar appears after hydration.
 *  - Desktop keeps the site bar (CabeceraDeTramite) and only adds the context line.
 */
export function useFlujoDeEntrada() {
  const directoryOn = useSiteFeatures().directorySections.length > 0;
  const raw = useSearchParams().get("redirect");
  const redirect = raw === "projects" ? "/publicar-solicitud" : rutaInternaSegura(raw);
  return { directoryOn, redirect, enFlujo: directoryOn && !!redirect };
}

type Frase = [string, string];
// What the person was trying to open, as «Inicie sesión para …». Unknown → «continuar».
function fraseDelDestino(destino: string): Frase | null {
  const [ruta, consulta = ""] = (destino.replace(/^\/(?:es|en)(?=\/|\?|$)/, "") || "/").split("?", 2);
  const p = new URLSearchParams(consulta);
  if (ruta === "/herramientas" || ruta.startsWith("/dashboard/pro") || (ruta === "/dashboard/profesional" && p.get("tab") === "tools")) return ["usar Herramientas", "use Tools"];
  if (ruta.startsWith("/dashboard")) return ["usar Mi panel", "use My panel"];
  if (ruta === "/listas" || ruta.startsWith("/lista/")) return ["usar Guardados", "use Saved"];
  if (ruta === "/mis-reservas" || ruta.startsWith("/reserva/")) return ["ver Mis reservas", "see My reservations"];
  if (ruta === "/yo") return ["usar Mi cuenta", "use My account"];
  if (ruta === "/mensajes") return ["ver Mensajes", "see Messages"];
  if (ruta === "/notificaciones") return ["ver Notificaciones", "see Notifications"];
  if (ruta === "/publicar-solicitud") return ["publicar una solicitud", "post a request"];
  if (ruta === "/empleos/publicar") return ["publicar un empleo", "post a job"];
  if (ruta === "/promociones/publicar") return ["publicar una promoción", "post a promotion"];
  if (ruta === "/cotizar") return ["pedir una cotización", "request a quote"];
  if (ruta === "/registro/empresa") return ["agregar su empresa", "add your business"];
  if (/^\/negocios\/[^/]+\/reclamar$/.test(ruta)) return ["reclamar este negocio", "claim this business"];
  if (ruta.startsWith("/profesionales/") && p.get("pendingReview") === "1") return ["escribir una reseña", "write a review"];
  if (ruta.startsWith("/profesionales/") && p.get("pendingAppointment") === "1") return ["reservar una cita", "book an appointment"];
  return null;
}

/** The line under the sign-in header: why the person is here. Directory on and `?redirect=` only; never truncated. */
export function MotivoDeEntrada({ className }: { className?: string }) {
  const { enFlujo, redirect } = useFlujoDeEntrada();
  const en = useLocale() === "en";
  if (!enFlujo || !redirect) return null;
  const frase = fraseDelDestino(redirect);
  const texto = frase
    ? (en ? `Sign in to ${frase[1]}` : `Inicie sesión para ${frase[0]}`)
    : (en ? "Sign in to continue" : "Inicie sesión para continuar");
  return <p data-login-context="" className={className ?? "mb-5 whitespace-normal break-words text-center text-[15px] font-semibold leading-snug text-[#007fae]"}>{texto}</p>;
}

/** «← Título» on the site bar, only when an in-app screen is behind this one (decided in the browser). */
function FlechaSiHayHistorial({ title }: { title: string }) {
  const [hay, setHay] = useState(false);
  useEffect(() => {
    // After the route registry noted this screen (RouteScrollReset runs in the same commit).
    const id = window.setTimeout(() => setHay(hayPantallaAnterior()), 0);
    return () => window.clearTimeout(id);
  }, []);
  return hay ? <SectionHeaderTitle title={title} tambienEnLaWeb centrado /> : null;
}

/**
 * Header of a sign-in screen.
 * `inicio`: the first screen of the flow (login). Otherwise a step: `onBack` for a step inside the same page (code,
 * kind of professional), else back through the history or to `parentHref` (the previous step's address).
 */
export function CabeceraDeEntrada({ title, inicio = false, onBack, parentHref }: {
  title: string;
  inicio?: boolean;
  onBack?: () => void;
  parentHref?: string;
}) {
  const { directoryOn, redirect, enFlujo } = useFlujoDeEntrada();
  const router = useRouter();
  const en = useLocale() === "en";
  if (!directoryOn) return <Navbar mobileSearch={false} />;
  if (onBack) return <CabeceraDeTramite title={title} onBack={onBack} backLabel={en ? "Back" : "Volver"} tituloComo="p" />;
  if (enFlujo && inicio) {
    const cerrar = () => { if (!salirDelFlujoDeEntrada(redirect)) router.replace("/"); };
    return <CabeceraDeTramite title={title} onBack={cerrar} cerrar backLabel={en ? "Close" : "Cerrar"} tituloComo="p" />;
  }
  if (enFlujo && parentHref) {
    const volver = () => { if (hayPantallaAnterior()) volverHastaSalir(); else router.push(parentHref); };
    return <CabeceraDeTramite title={title} onBack={volver} backLabel={en ? "Back" : "Volver"} tituloComo="p" />;
  }
  return <><Navbar mobileSearch={false} /><FlechaSiHayHistorial title={title} /></>;
}
