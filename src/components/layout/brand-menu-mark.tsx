import { Menu, X } from "lucide-react";
import { ContrataCRMark } from "@/components/brand/brand-logo";

/** The menu button (owner, 2026-11-26): a light pill with the ContrataCR symbol untouched and a small ≡ that becomes ✕
 * while the menu is open. The account stays inside the menu. */
export function BrandMenuMark() {
  return (
    <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[#eef3f7] pl-1.5 pr-3">
      <ContrataCRMark />
      {/* ≡ turns into ✕ while the menu is open (globals.css: data-brand-menu-icon). */}
      <span aria-hidden data-brand-menu-icon className="relative h-4 w-4 text-[#162543]">
        <Menu className="ccr-bm-open absolute inset-0 h-4 w-4" strokeWidth={2.6} />
        <X className="ccr-bm-close absolute inset-0 h-4 w-4" strokeWidth={2.6} />
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
