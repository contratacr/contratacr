"use client";

import { Link } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";

// A "Registrá tu perfil" link that respects the session: logged-in users are
// sent to their own panel instead of the registration flow.
export function SmartRegisterLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  let href = "/registro/profesional";
  if (user) {
    const role = (user.user_metadata?.role as string | undefined) ?? "client";
    href = role === "professional" ? "/dashboard/profesional" : "/dashboard/cliente";
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
