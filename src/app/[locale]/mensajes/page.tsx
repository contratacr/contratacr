import { DirectChatInbox } from "@/components/dashboard/direct-chat-inbox";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";

export default function MessagesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#edf2f7]">
      <LandingNavbar />
      <main data-messages-page-main className="flex min-h-0 w-full flex-1 flex-col px-0 pb-0 pt-16 sm:px-3 sm:pb-8 sm:pt-24 lg:px-8 lg:pb-10 xl:px-12 2xl:px-16">
        <section data-messages-page-shell className="mx-auto min-h-0 w-full max-w-[1880px] overflow-hidden">
          <DirectChatInbox />
        </section>
      </main>
      <div className="hidden sm:block">
        <LandingFooter />
      </div>
    </div>
  );
}
