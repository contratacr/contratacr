import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { NotificationsList } from "@/components/notifications/notifications-list";

export default function NotificationsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8fb]">
      <LandingNavbar />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <section className="rounded-2xl border border-[#dfe8f0] bg-white p-4 shadow-sm sm:p-6">
          <NotificationsList />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
