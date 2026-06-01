"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingModal } from "./booking-modal";
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
  const [open, setOpen] = useState(false);
  const t = useTranslations("booking");

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <CalendarDays className="h-4 w-4" />
        {t("requestService")}
      </Button>

      <BookingModal
        professional={professional}
        categoryName={categoryName}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
