"use client";

import { Bell, Handshake, Headset, ReceiptText, ShieldCheck, Star } from "lucide-react";

// Un icono por familia de aviso VIVA. Las de citas, propuestas, postulaciones,
// seguir y recordatorios se retiraron con sus flujos; lo historico cae en la
// campana generica.
export function NotificationSourceIcon({ type, className }: { type: string; className?: string }) {
  switch (type) {
    case "new_project":
    case "project_cancelled":
      return <Handshake className={className} />;
    case "review_received":
      return <Star className={className} />;
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
    case "support_reply":
      return <Headset className={className} />;
    default:
      return <Bell className={className} />;
  }
}
