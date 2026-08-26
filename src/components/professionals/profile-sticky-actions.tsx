"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useLocale } from "next-intl";
import { DirectChatLauncher } from "@/components/professionals/direct-chat-launcher";
import { ContactButton } from "@/components/professionals/contact-button";

// Phone-only bar pinned to the bottom of the profile once the contact card has
// scrolled out of view: the three things a visitor came to do — message,
// call, see the agenda — stay one thumb away while they read services, reviews
// and cases. Hidden on desktop (the contact card is a sticky aside there), on
// the professional's own profile, and while the contact card is on screen.
export function ProfileStickyActions({
  professionalId,
  professionalName,
  contextTitle,
  isOwn,
  canCall,
  contactCardId = "perfil-contacto",
}: {
  professionalId: string;
  professionalName: string;
  contextTitle?: string;
  isOwn: boolean;
  canCall?: boolean;
  contactCardId?: string;
}) {
  const locale = useLocale();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const card = document.getElementById(contactCardId);
    if (!card) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        // Show whenever the card is off-screen (on phones it sits after the
        // sections, so the actions must be reachable while reading them).
        setShow(!entry.isIntersecting);
      },
      { threshold: 0 },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [contactCardId]);

  if (isOwn || !show) return null;

  const scrollToCard = () => document.getElementById(contactCardId)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div
      data-testid="profile-sticky-actions"
      className="ccr-profile-sticky-actions fixed inset-x-0 bottom-0 z-40 border-t border-[#e5e7eb] bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-6px_20px_rgba(22,37,67,0.08)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto flex max-w-xl items-center gap-2">
        <button
          type="button"
          onClick={scrollToCard}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#cfe6f5] bg-[#EBF5FB] px-3.5 text-[13px] font-bold text-[#0089bb]"
        >
          <CalendarDays className="h-4 w-4" />
          {locale === "en" ? "Availability" : "Disponibilidad"}
        </button>
        <DirectChatLauncher
          professionalId={professionalId}
          professionalName={professionalName}
          contextTitle={contextTitle}
          isOwn={isOwn}
          analyticsSource="profile"
          tone="primary"
          className="h-11 min-w-0 flex-1 rounded-full text-[13px] font-bold"
        />
        {canCall && (
          <ContactButton
            method="phone"
            professionalId={professionalId}
            professionalName={professionalName}
            contextTitle={contextTitle}
            source="profile"
            iconOnly
            label={locale === "en" ? "Call" : "Llamar"}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[#162543] disabled:opacity-60"
          />
        )}
      </div>
    </div>
  );
}
