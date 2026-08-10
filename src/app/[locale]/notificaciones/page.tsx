import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { NotificationsList } from "@/components/notifications/notifications-list";

export default function NotificationsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8fb]">
      <LandingNavbar />
      <main className="ccr-notifications-page-main flex w-full flex-1 flex-col px-0 pb-0 pt-16 sm:px-6 sm:pb-16 sm:pt-24 lg:px-8">
        <section className="ccr-notifications-page-panel mx-auto w-full max-w-5xl flex-1 bg-white px-5 pb-5 pt-5 sm:flex-none sm:rounded-2xl sm:border sm:border-[#dfe8f0] sm:p-6 sm:shadow-sm">
          <NotificationsList scope="all" />
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
