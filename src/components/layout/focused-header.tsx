import { Link } from "@/i18n/navigation";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";

// The header for screens where the person is in the middle of something —
// choosing a role, completing a profile after a social sign-in: just the logo,
// centred. No menu, no bell: the account is not usable yet, and every extra
// control is a way out of the flow. Onboarding and completar-perfil already
// looked like this; the registration steps now match instead of switching to
// the full navbar the moment a Google sign-in creates the session.
export function FocusedHeader() {
  return (
    <header className="flex justify-center border-b border-gray-100 bg-white px-4 py-4">
      <Link href="/" aria-label="ContrataCR">
        <ContrataCRLogo />
      </Link>
    </header>
  );
}
