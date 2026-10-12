import { VerifiedSeal } from "@/components/ui/verified-seal";
import { cn } from "@/lib/utils";

/** Variante con texto para el perfil y los detalles de identidad. Las tarjetas
 * usan VerificationInfo: solo el check con su explicación al tocarlo. */
export const CEDULA_COMPACTA = "shrink-0 whitespace-nowrap text-[12px] font-semibold leading-none text-[#4b5b70]";

/** Etiqueta escrita, conservada en las fichas y el panel de la cuenta. */
export function CedulaVerificada({ texto, className }: { texto: string; className?: string }) {
  return (
    <span
      data-cedula-verificada
      className={cn("flex items-center gap-1 text-[13px] font-medium leading-5 text-[#4b5b70]", className)}
    >
      <VerifiedSeal className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />
      {texto}
    </span>
  );
}
