import { ChevronDown } from "lucide-react";
import { ContrataCRMark } from "@/components/brand/brand-logo";

/** The ContrataCR symbol as the menu button: the symbol untouched, and a small round chevron badge beside its lower
 * right corner. The chevron turns up while the menu is open (globals.css, data-brand-chevron). */
export function BrandMenuMark() {
  return (
    <span className="inline-flex shrink-0 items-end gap-0.5">
      <ContrataCRMark />
      <span aria-hidden data-brand-chevron className="mb-px grid h-4 w-4 place-items-center rounded-full bg-[#eef3f7]">
        <ChevronDown className="h-3 w-3 text-[#162543] transition-transform duration-300" strokeWidth={3} />
      </span>
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
  const row = button.closest<HTMLElement>("[data-ccr-menu-row]") ?? button.closest<HTMLElement>("[data-ccr-section-brand]")?.parentElement ?? button.parentElement;
  const bottom = Math.round((row ?? button).getBoundingClientRect().bottom);
  document.documentElement.style.setProperty("--ccr-menu-top", `${Math.max(0, bottom)}px`);
  window.dispatchEvent(new Event("ccr:open-mobile-menu"));
}
