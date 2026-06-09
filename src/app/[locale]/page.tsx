import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { BarkHome } from "@/components/landing/bark-home";
import { BackToTop } from "@/components/landing/back-to-top";

// Service-directory home in the spirit of a clean marketplace: a focused hero
// + search, an auto-scrolling category strip, grouped service sections, and a
// most-popular carousel. The navbar reveals its own search on scroll.
export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />
      <BarkHome />
      <BackToTop />
      <LandingFooter />
    </div>
  );
}
