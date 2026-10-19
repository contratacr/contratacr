"use client";
import { AdminMfa } from "./admin-mfa";
export function AdminMfaEntry({ enrolled }: { enrolled: boolean }) {
  return <AdminMfa enrolled={enrolled} onVerified={async () => { window.location.reload(); }} />;
}
