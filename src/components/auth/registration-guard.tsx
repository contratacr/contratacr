"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { pendingRegistrationPath, registrationComplete } from "@/lib/auth/registration-state";
import { LienzoNeutro } from "@/components/ui/section-skeletons";

// Middleware cannot run when Back restores a cached client route. Keep the same
// check mounted in the panel so a connected identity is not a completed account.
export function RegistrationGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const pending = !!user && !registrationComplete(user.user_metadata);
  const destination = pendingRegistrationPath(user?.user_metadata);
  useEffect(() => {
    if (loading || !pending) return;
    const resume = () => router.replace(destination);
    resume();
    window.addEventListener("pageshow", resume);
    window.addEventListener("popstate", resume);
    return () => {
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("popstate", resume);
    };
  }, [loading, pending, destination, pathname, router]);
  if (loading || pending) return <LienzoNeutro />;
  return children;
}
