import { ChevronDown } from "lucide-react";
import { ContrataCRMark } from "@/components/brand/brand-logo";

/** The menu button (owner, 2026-11-26, workspace-switcher style like Notion/Linear): the ContrataCR symbol untouched and a
 * soft grey chevron centred beside it, no background. The account stays inside the menu. */
export function BrandMenuMark() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <ContrataCRMark />
      {/* Soft grey chevron centred on the symbol; it turns over while the menu is open (globals.css). */}
      <ChevronDown aria-hidden data-brand-chevron className="h-4 w-4 text-[#7a8797] transition-transform duration-300" strokeWidth={2.4} />
    </span>
  );
}

/**
 * Phones (owner, 2026-11-26): the menu unfolds downward right under the row of the button that opened it (logo and
 * search stay visible); the same button closes it.
 */
export function toggleBrandMenu(button: HTMLElement) {
  // Some screens mount two navbars (phone and desktop), each with its own menu: close every open one.
  const open = document.querySelectorAll<HTMLElement>(".ccr-menu-completo.ccr-menu-abierto");
  if (open.length) {
    open.forEach((menu) => menu.querySelector<HTMLElement>("[data-menu-close]")?.click());
    return;
  }
  // Map screens (floating search card): the menu covers the whole screen with its own logo and close row.
  const full = !!button.closest("[data-quick-nav-floating]");
  document.documentElement.classList.toggle("ccr-menu-full", full);
  if (full) {
    document.documentElement.style.setProperty("--ccr-menu-top", "0px");
    window.dispatchEvent(new Event("ccr:open-mobile-menu"));
    return;
  }
  const row = button.closest<HTMLElement>("[data-ccr-menu-row]") ?? button.closest<HTMLElement>("[data-ccr-section-brand]")?.parentElement ?? button.parentElement;
  const bottom = Math.round((row ?? button).getBoundingClientRect().bottom);
  document.documentElement.style.setProperty("--ccr-menu-top", `${Math.max(0, bottom)}px`);
  window.dispatchEvent(new Event("ccr:open-mobile-menu"));
}
