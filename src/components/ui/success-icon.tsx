import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The app-wide success-confirmation badge — used on EVERY "creado / enviado / completado"
 * screen so they look identical and polished. The "colored icon on a light tint of the same
 * color" pattern: a pale brand-blue circle (`#EBF5FB`) with a subtle inset brand ring and a
 * soft brand-blue glow, holding the strong brand-blue check. Replaces the old disconnected
 * grey circle / bare green check. `size` is the circle diameter in px (the check scales with it).
 */
export function SuccessIcon({ size = 80, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-grid shrink-0 place-items-center rounded-full bg-[#EBF5FB]",
        "ring-1 ring-inset ring-[#009FD9]/20 shadow-[0_10px_30px_-10px_rgba(0,159,217,0.5)]",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <Check className="text-[#009FD9]" strokeWidth={3} style={{ width: size * 0.46, height: size * 0.46 }} />
    </span>
  );
}
