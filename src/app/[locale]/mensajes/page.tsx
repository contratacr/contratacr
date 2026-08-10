import { DirectChatInbox } from "@/components/dashboard/direct-chat-inbox";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";

export default function MessagesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f5f8fb]">
      <LandingNavbar />
      <main data-messages-page-main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-0 pb-0 pt-16 sm:px-6 sm:pb-12 sm:pt-24 lg:px-8">
        <section data-messages-page-shell className="min-h-[calc(100dvh-4rem)] overflow-hidden bg-white shadow-sm sm:min-h-[680px] sm:rounded-2xl sm:border sm:border-[#dfe8f0]">
          <DirectChatInbox />
        </section>
      </main>
      <div className="hidden sm:block">
        <LandingFooter />
      </div>
    </div>
  );
}
