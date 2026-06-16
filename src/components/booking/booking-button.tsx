"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingModal } from "./booking-modal";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
import { SelfActionModal, SELF_MSG } from "@/components/professionals/self-action-modal";
import { useAuth } from "@/hooks/use-auth";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

interface BookingButtonProps {
  professional: ProfessionalCardData;
  categoryName: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Override the default "Solicitar servicio" label (e.g. "Ver horario completo"). */
  label?: string;
}

export function BookingButton({
  professional,
  categoryName,
  variant = "default",
  size = "md",
  className,
  label,
}: BookingButtonProps) {
  const { user } = useAuth();
  const [showRegistration, setShowRegistration] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const [showSelf, setShowSelf] = useState(false);
  const t = useTranslations("booking");

  // A pro cannot request a service from themselves. We still SHOW the normal
  // button (so their profile looks identical to a client's), but block the
  // action with a friendly modal instead of booking.
  const isOwn = !!user && !!professional.profileId && user.id === professional.profileId;

  function handleClick() {
    if (isOwn) {
      setShowSelf(true);
    } else if (user) {
      setShowBooking(true);
    } else {
      setShowRegistration(true);
    }
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={handleClick}>
        <CalendarDays className="h-4 w-4" />
        {label ?? t("requestService")}
      </Button>

      {/* Step 1: inline registration for non-logged-in users */}
      <ClientRegistrationModal
        open={showRegistration}
        onClose={() => setShowRegistration(false)}
        onSuccess={() => {
          setShowRegistration(false);
          setShowBooking(true);
        }}
        professionalName={professional.fullName}
      />

      {/* Step 2: actual booking (for logged-in or post-registration) */}
      <BookingModal
        professional={professional}
        categoryName={categoryName}
        open={showBooking}
        onClose={() => setShowBooking(false)}
      />

      {/* Own profile — block the self-request with an explanation. */}
      <SelfActionModal open={showSelf} onClose={() => setShowSelf(false)} message={SELF_MSG.request} />
    </>
  );
}
