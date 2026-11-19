import { RegistrationGuard } from "@/components/auth/registration-guard";
import { ProFetchWatchdog } from "@/components/pro/pro-fetch-watchdog";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <RegistrationGuard><ProFetchWatchdog />{children}</RegistrationGuard>;
}
