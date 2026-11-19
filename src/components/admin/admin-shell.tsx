import { AdminShellClient } from "./admin-shell-client";
import { PRO_ENABLED } from "@/lib/pro/enabled";
import { DIR_ENABLED } from "@/lib/directory/feature-flags";

export type { AdminTab } from "./admin-shell-client";

// Server wrapper of the admin shell (2026-11-18): the launch flags PRO_ENABLED and DIR_ENABLED are server-only, so they
// are read here and handed to the client shell, which hides the «ContrataCR Pro» and «Directorio» sections while off.
export function AdminShell(props: Omit<React.ComponentProps<typeof AdminShellClient>, "features">) {
  return <AdminShellClient {...props} features={{ pro: PRO_ENABLED, directory: DIR_ENABLED }} />;
}
