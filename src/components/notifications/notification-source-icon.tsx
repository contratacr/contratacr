"use client";

import { UserRoundCheck, UserRoundX, Handshake, Headset, MessageSquareText, ReceiptText, ShieldCheck, Star, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

// Un icono por familia de aviso VIVA. Las de citas, propuestas, postulaciones,
// seguir y recordatorios se retiraron con sus flujos. Lo demás lleva la marca
// de ContrataCR: una campana DENTRO de Notificaciones no dice nada —todo ahí es
// una notificación— y el aviso que no es de nadie en particular es de la app.
export function NotificationSourceIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "new_job":
      return <Briefcase className={className} />;
    case "new_project":
    case "project_cancelled":
    case "invita_proyecto":
      return <Handshake className={className} />;
    case "review_received":
    case "resena_google":
      return <Star className={className} />;
    case "direct_message":
      return <MessageSquareText className={className} />;
    case "verification_approved":
    case "verification_pending":
    case "verification_rejected":
    case "verification_reverted":
    case "verification_appeal_received":
    case "verification_outreach":
      return <ShieldCheck className={className} />;
    case "suggestion_approved":
    case "suggestion_rejected":
      return <ReceiptText className={className} />;
    case "completa_perfil":
      return <UserRoundCheck className={className} />;
    case "support_reply":
      return <Headset className={className} />;
    case "counterparty_account_deleted":
      return <UserRoundX className={className} />;
    default:
      // eslint-disable-next-line @next/next/no-img-element -- isotipo fijo y pequeño
      return <img src="/logo-mark-transparent.png" alt="" className={cn(className, "scale-125 object-contain")} />;
  }
}
