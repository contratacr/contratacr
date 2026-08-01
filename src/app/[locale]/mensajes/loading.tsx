import { Loader2 } from "lucide-react";
import { LandingNavbar } from "@/components/landing/landing-navbar";

export default function MessagesLoading() {
  return (
    <div className="flex min-h-screen flex-col bg-[#edf2f7]">
      <LandingNavbar />
      <main className="box-border flex h-[100dvh] min-h-0 w-full flex-col px-0 pb-0 pt-16 sm:px-3 sm:pb-5 sm:pt-20 lg:px-8 lg:pb-8 lg:pt-24 xl:px-12 2xl:px-16">
        <section className="mx-auto grid h-full min-h-0 w-full max-w-[1880px] place-items-center overflow-hidden">
          <div className="ccr-delayed-loading flex w-full max-w-md flex-col items-center justify-center gap-3 px-4 text-center" aria-busy="true" role="status">
            <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" aria-hidden />
            <p className="text-sm font-extrabold text-[#162543]">Cargando</p>
          </div>
        </section>
      </main>
    </div>
  );
}
