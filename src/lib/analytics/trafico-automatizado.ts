// TRÁFICO DE PRUEBAS FUERA DE LAS ANALÍTICAS (2-oct-2026).
// Las pruebas automáticas (Playwright en CI, smoke diario contra producción,
// grabación de los videos de la guía, vigilancia) no deben contar como visitas,
// vistas de perfil ni contactos. Se reconocen por:
//  - navigator.webdriver (todo navegador manejado por Playwright lo trae en true),
//  - la cookie `ccr_sin_analitica=1`, que el arranque pone cuando ve webdriver, y
//  - el agente de usuario de herramientas sin navegador (curl, node, Headless).
import type { NextRequest } from "next/server";

export const COOKIE_SIN_ANALITICA = "ccr_sin_analitica";
const AGENTE_AUTOMATIZADO = /HeadlessChrome|Playwright|curl\/|node-fetch|undici|python-requests|Go-http-client|wget/i;

export function esNavegadorAutomatizado(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.webdriver === true || document.cookie.includes(`${COOKIE_SIN_ANALITICA}=1`);
}

export function esPeticionAutomatizada(cookie: string | undefined | null, agente: string | null | undefined): boolean {
  return cookie === "1" || AGENTE_AUTOMATIZADO.test(agente ?? "");
}

export function peticionAutomatizada(req: NextRequest): boolean {
  return esPeticionAutomatizada(req.cookies.get(COOKIE_SIN_ANALITICA)?.value, req.headers.get("user-agent"));
}
