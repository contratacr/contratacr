"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { canOffer } from "@/lib/auth/capabilities";
import { createClient } from "@/lib/supabase/client";

// A professional-entry link that respects the account's real capability.
// Clients see the registration action; existing providers see their panel and
// must never be invited to register again.
export function SmartRegisterLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const locale = useLocale();
  const { user, loading } = useAuth();
  const [canonicalCapability, setCanonicalCapability] = useState<{
    userId: string;
    hasProfessionalProfile: boolean;
    status: "known" | "error";
  } | null>(null);

  const metadataProvider = canOffer(user);

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => setCanonicalCapability(null));
      return;
    }
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const loadCapability = async (attempt: number) => {
      try {
        const { data, error } = await createClient()
          .from("professionals")
          .select("id")
          .eq("profile_id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (!error) {
          setCanonicalCapability({
            userId: user.id,
            hasProfessionalProfile: Boolean(data),
            status: "known",
          });
          return;
        }
      } catch {
        if (cancelled) return;
      }

      // A transient capability failure must not make this navigation disappear
      // forever. Keep a safe panel fallback visible and retry in the background;
      // never guess that an unresolved account should register as a provider.
      setCanonicalCapability({ userId: user.id, hasProfessionalProfile: false, status: "error" });
      if (attempt < 2) {
        retryTimer = setTimeout(() => void loadCapability(attempt + 1), 750 * (attempt + 1));
      }
    };
    void loadCapability(0);

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [user]);

  const currentCapability = !!user && canonicalCapability?.userId === user.id
    ? canonicalCapability
    : null;
  const canonicalKnown = currentCapability?.status === "known";
  const capabilityFailed = currentCapability?.status === "error";

  // Preserve layout while auth/capability is unresolved, but never expose a
  // misleading registration action that can flash for an existing provider.
  if ((loading && !user) || (user && !metadataProvider && !canonicalKnown && !capabilityFailed)) {
    return <span className={className} aria-hidden="true" style={{ visibility: "hidden" }}>{children}</span>;
  }

  const provider = canonicalKnown ? currentCapability.hasProfessionalProfile : metadataProvider;
  const unresolvedAccount = !!user && capabilityFailed && !provider;
  const href = provider
    ? "/dashboard/profesional?mode=offer"
    : unresolvedAccount
      ? "/dashboard/profesional?mode=use"
      : "/registro/profesional";
  const label = provider
    ? (locale === "en" ? "Professional panel" : "Panel profesional")
    : unresolvedAccount
      ? (locale === "en" ? "My panel" : "Mi panel")
      : children;

  return (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}
