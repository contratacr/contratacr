"use client";

import type { ComponentProps } from "react";
import { useLocale } from "next-intl";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";

/** Local Pro opt-in: keep the shared modal design with usable touch targets. */
export function ProModal({ className, ...props }: ComponentProps<typeof Modal>) {
  const locale = useLocale();
  return <Modal {...props} closeLabel={props.closeLabel === undefined ? (locale === "en" ? "Close dialog" : "Cerrar diálogo") : props.closeLabel} manageFocus ariaLabel={props.ariaLabel??(typeof props.title==='string'?props.title:undefined)}
    // A visually hidden control (`sr-only` is position:absolute) used to take the
    // dialog itself as its containing block: it escaped the scrolling body, made
    // the overflow-hidden dialog taller than the screen, and focusing it (file
    // pickers, checkboxes) scrolled the DIALOG — the header disappeared and the
    // footer floated mid-screen. The body now contains its own positioned
    // descendants and the dialog clips instead of scrolling.
    bodyClassName={cn("relative",props.bodyClassName)} className={cn(
    "[&>[role=dialog]]:overflow-clip",
    // Safari can expose the layout viewport between its keyboard accessory
    // bar and the smaller visual viewport. Keep that band within the editor,
    // while the dialog itself still fits the usable area above the keyboard.
    props.mobilePresentation === "fullscreen" && "before:fixed before:inset-0 before:bg-white before:content-[''] sm:before:hidden",
    "[&_button]:min-h-11 [&_button]:min-w-11 [&_summary]:min-h-11",
    "[&_select]:h-11 [&_select]:min-h-11 [&_input:not([type=checkbox]):not([type=radio]):not([type=hidden])]:min-h-11",
    // Move only an explicitly padded card's vertical inset onto its summary.
    // The hit area fills that inset without increasing the closed card height;
    // unpadded details retain their own bounds and cannot overlap neighbours.
    "[&_details.p-3>summary]:-my-3 [&_details.p-3>summary]:py-3",
    "[&_details.p-4>summary]:-my-4 [&_details.p-4>summary]:py-4",
    className,
  )} />;
}
