import { DirectChatInbox } from "@/components/dashboard/direct-chat-inbox";
import { LandingNavbar } from "@/components/landing/landing-navbar";

export default function MessagesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-[#edf2f7]">
      <LandingNavbar />
      <main data-messages-page-main className="box-border flex h-[100dvh] min-h-0 w-full flex-col px-0 pb-0 pt-16 sm:px-3 sm:pb-5 sm:pt-20 lg:px-8 lg:pb-8 lg:pt-24 xl:px-12 2xl:px-16">
        <section data-messages-page-shell className="mx-auto flex h-full min-h-0 w-full max-w-[1880px] overflow-hidden">
          <DirectChatInbox />
        </section>
      </main>
    </div>
  );
}
