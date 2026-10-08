/**
 * VOLVER COMO EN LAS APPS: a la misma altura de la lista de la que se salió.
 *
 * Las flechas de «volver» eran enlaces nuevos (`push`) a la lista: la lista se
 * abría desde arriba y había que buscar otra vez dónde se iba. Ahora:
 *  - Mientras se navega se anota, por dirección, hasta dónde se había bajado.
 *  - Si la flecha lleva a la pantalla ANTERIOR, se vuelve por el historial
 *    (como la flecha del navegador) en vez de abrirla de nuevo.
 *  - Al volver por el historial, la pantalla se repone a la altura anotada
 *    (RouteScrollReset); una navegación nueva sigue estrenando arriba.
 */

const CLAVE_POSICIONES = "ccr:posiciones";
const CLAVE_ANTERIOR = "ccr:ruta-anterior";
const CLAVE_ACTUAL = "ccr:ruta-actual";

function claveDeRuta(url: string = typeof window === "undefined" ? "" : window.location.pathname + window.location.search): string {
  try {
    const u = new URL(url, "https://x");
    return (u.pathname.replace(/\/$/, "") || "/") + u.search;
  } catch {
    return url;
  }
}

type Posicion = { s: string; y: number };

function leer(): Record<string, Posicion> {
  try { return JSON.parse(sessionStorage.getItem(CLAVE_POSICIONES) || "{}"); } catch { return {}; }
}

// Lo que se desplaza depende de la pantalla: la ventana (web), <main> (app),
// la lista de un tablero (Promociones, Empleos, Proyectos) o la hoja de
// resultados de /profesionales. Se anota CUÁL se movió para reponer ese mismo.
const DESPLAZADORES = [".ccr-lista-tablero", ".ccr-search-sheet-scroll", "main"];

function elementoDe(s: string): Element | null {
  if (s === "ventana") return document.scrollingElement ?? document.documentElement;
  return document.querySelector(s);
}

export function anotarPosicion(objetivo: EventTarget | null): void {
  try {
    let s: string | null = null;
    if (objetivo === document || objetivo === window || objetivo === document.scrollingElement || objetivo === document.documentElement) s = "ventana";
    else if (objetivo instanceof Element) s = DESPLAZADORES.find((sel) => objetivo.matches(sel)) ?? null;
    if (!s) return;
    const el = elementoDe(s);
    const y = s === "ventana" ? window.scrollY : (el?.scrollTop ?? 0);
    const todas = leer();
    todas[claveDeRuta()] = { s, y: Math.round(y) };
    sessionStorage.setItem(CLAVE_POSICIONES, JSON.stringify(todas));
  } catch { /* sin almacenamiento: se vuelve arriba, como antes */ }
}

export function posicionAnotada(): Posicion | null {
  const p = leer()[claveDeRuta()];
  return p && p.y > 0 ? p : null;
}

/** Lleva el desplazador anotado a su altura; devuelve si ya llegó. */
export function reponer(p: Posicion): boolean {
  if (p.s === "ventana") {
    const max = (document.scrollingElement ?? document.documentElement).scrollHeight - window.innerHeight;
    window.scrollTo({ top: Math.min(p.y, max), left: 0, behavior: "instant" as ScrollBehavior });
    return Math.abs(window.scrollY - p.y) <= 2;
  }
  const el = elementoDe(p.s) as HTMLElement | null;
  if (!el) return false;
  el.scrollTop = Math.min(p.y, el.scrollHeight - el.clientHeight);
  return Math.abs(el.scrollTop - p.y) <= 2;
}

/** La pantalla de la que se vino (dentro de la app), o null. */
export function rutaAnterior(): string | null {
  try {
    // Mientras la pantalla nueva se pinta, el registro aún no la anotó: la
    // «actual» anotada ES la anterior. Ya anotada, la anterior es la otra.
    const actual = sessionStorage.getItem(CLAVE_ACTUAL);
    if (actual && actual !== claveDeRuta()) return actual;
    return sessionStorage.getItem(CLAVE_ANTERIOR);
  } catch {
    return null;
  }
}

/** Se llama en cada cambio de ruta: la que había pasa a ser «la anterior». */
export function anotarCambioDeRuta(): void {
  try {
    const actual = claveDeRuta();
    const previa = sessionStorage.getItem(CLAVE_ACTUAL);
    if (previa && previa !== actual) sessionStorage.setItem(CLAVE_ANTERIOR, previa);
    sessionStorage.setItem(CLAVE_ACTUAL, actual);
  } catch { /* sin almacenamiento */ }
}

/**
 * Si `href` es la pantalla de la que se vino, vuelve por el historial y
 * devuelve true. Si no (se entró por un enlace directo), devuelve false y quien
 * llama navega como siempre.
 */
export function volverSiEsLaAnterior(href: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const anterior = sessionStorage.getItem(CLAVE_ANTERIOR);
    const destino = claveDeRuta(href.replace(/^\/es(?=\/|$)/, ""));
    if (!anterior || window.history.length < 2) return false;
    const sinIdioma = (r: string) => r.replace(/^\/es(?=\/|$)/, "") || "/";
    // La lista puede llevar filtros en la dirección (?q=…): basta la misma ruta.
    if (sinIdioma(anterior).split("?")[0] !== sinIdioma(destino).split("?")[0]) return false;
    window.history.back();
    return true;
  } catch {
    return false;
  }
}
