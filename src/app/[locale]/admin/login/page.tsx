import { redirect } from "next/navigation";

// Legacy path — the admin login now lives at /admin itself.
export default function AdminLoginRedirect() {
  redirect("/admin");
}
