"use client";

import { Navbar } from "@/components/layout/navbar";
import { BrandLoadingMark } from "@/components/ui/content-loading";

export function DashboardRouteLoading() {
  return <PageRouteLoading />;
}

export function PageRouteLoading() {
  return (
    <div className="min-h-screen bg-[#f4f7fa] text-[#162543]" aria-busy="true">
      <Navbar />
      <div className="ccr-navbar-spacer h-16" aria-hidden />
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-12 sm:px-6 lg:px-8">
        <BrandLoadingMark className="min-h-[calc(100dvh-64px)]" />
      </main>
    </div>
  );
}
