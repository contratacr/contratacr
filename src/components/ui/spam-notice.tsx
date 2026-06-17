"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

// Consistent "also check your spam/junk folder" reminder, shown on EVERY screen that
// tells the user to look in their email (OTP, sign-up confirmation, password
// recovery, email-change confirmation, support ticket created…). Subtle grey text;
// one shared wording (common.spamNotice, es+en) so it reads the same everywhere.
export function SpamNotice({ className }: { className?: string }) {
  const t = useTranslations("common");
  return <p className={cn("text-xs text-[#9ca3af]", className)}>{t("spamNotice")}</p>;
}
