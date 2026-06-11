"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingModal } from "./booking-modal";
import { ClientRegistrationModal } from "@/components/auth/client-registration-modal";
import { useAuth } from "@/hooks/use-auth";
import type { ProfessionalCardData } from "@/lib/data/mock-professionals";

interface BookingButtonProps {
  professional: ProfessionalCardData;
  categoryName: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function BookingButton({
  professional,
  categoryName,
  variant = "default",
  size = "md",
  className,
}: BookingButtonProps) {
  const { user } = useAuth();
  const [showRegistration, setShowRegistration] = useState(false);
  const [showBooking, setShowBooking] = useState(false);
  const t = useTranslations("booking");

  // A pro cannot request a service from themselves — show a clear state instead.
  const isOwn = !!user && !!professional.profileId && user.id === professional.profileId;

  function handleClick() {
    if (user) {
      setShowBooking(true);
    } else {
      setShowRegistration(true);
    }
  }

  if (isOwn) {
    return (
      <Button variant="outline" size={size} className={className} asChild>
        <a href="/es/dashboard/profesional">Este es tu perfil</a>
      </Button>
    );
  }

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={handleClick}>
        <CalendarDays className="h-4 w-4" />
        {t("requestService")}
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
    </>
  );
}
