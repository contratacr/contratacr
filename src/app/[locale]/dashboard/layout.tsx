import { RegistrationGuard } from "@/components/auth/registration-guard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <RegistrationGuard>{children}</RegistrationGuard>;
}
