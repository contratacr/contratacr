/**
 * Shared stacking layers for overlays that open over the mobile bottom tab bar.
 *
 * Since 2026-11-23 the 5-tab bar (`DirectoryTabs`, `CAPA_BARRA_ABAJO`) also shows on mobile web, on almost
 * every public and dashboard route below 1024 px. An overlay painted under it loses its footer buttons on
 * phones (the «Filtros» drawer, the leads column chooser). The rule:
 *
 * - CAPA_BARRA_ABAJO (90): the bottom tab bar. Page content and page-level floating elements stay below it
 *   and reserve its height instead (`--ccr-aviso-barra-app`, `body.ccr-dir-tabs-visible` padding).
 * - CAPA_HOJA (100): sheets, drawers, modals and full-screen overlays. Matches `ui/modal.tsx`.
 * - Toasts sit above sheets (notification toast z-[180]).
 * - CAPA_CONFIRMACION (250): confirmation dialogs, above sheets and toasts.
 *
 * Literal strings on purpose: Tailwind only generates classes it can read in the source.
 * Overlays already above the bar with their own value (z-[120], z-[220], ...) keep it; new or changed
 * overlays use these constants.
 */
export const CAPA_BARRA_ABAJO = "z-[90]";
export const CAPA_HOJA = "z-[100]";
export const CAPA_CONFIRMACION = "z-[250]";
