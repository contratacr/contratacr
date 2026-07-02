"use client";

import { useEffect, useState, type ComponentType } from "react";
import {
  Bookmark,
  BookOpen,
  Copy,
  Download,
  Ellipsis,
  Home,
  Search,
  Share2,
  Smartphone,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function isIosDevice() {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform.toLowerCase();
  const touchMac = platform.includes("mac") && window.navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/.test(ua) || touchMac;
}

function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

function useInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    const frame = window.requestAnimationFrame(() => {
      setIsIos(isIosDevice());
      setStandalone(isStandaloneMode());
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  }

  return {
    canPrompt: Boolean(installEvent) && !standalone && !installed,
    installed: standalone || installed,
    isIos,
    install,
  };
}

function InstallAction({
  canPrompt,
  installed,
  install,
  className = "",
}: {
  canPrompt: boolean;
  installed: boolean;
  install: () => Promise<void>;
  className?: string;
}) {
  const t = useTranslations("installGuide");

  if (installed || !canPrompt) return null;

  return (
    <button
      type="button"
      onClick={install}
      className={`inline-flex items-center justify-center gap-2 rounded-full bg-[#009FD9] px-5 py-2.5 text-sm font-black text-white shadow-[0_10px_24px_rgba(0,159,217,0.22)] transition-colors hover:bg-[#0089bb] ${className}`}
    >
      <Download className="h-4 w-4" />
      {t("installCta")}
    </button>
  );
}

export function InstallHomeBand() {
  const t = useTranslations("installGuide");
  const { canPrompt, installed, install } = useInstallPrompt();

  return (
    <section className="bg-white px-4 pb-12 pt-2 sm:px-6 sm:pb-16 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-3xl border border-[#d8edf7] bg-gradient-to-br from-[#f8fbfd] via-white to-[#eef8fc]">
          <div className="grid gap-5 p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex min-w-0 items-start gap-4">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-[#0089bb] ring-1 ring-[#cfeaf5]">
                <Smartphone className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#009FD9]">{t("homeEyebrow")}</p>
                <h2 className="mt-1 text-xl font-extrabold leading-tight text-[#162543] sm:text-2xl">{t("homeTitle")}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5f6b7a] sm:text-base">{t("homeBody")}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row md:justify-end">
              <InstallAction canPrompt={canPrompt} installed={installed} install={install} className="w-full sm:w-auto" />
              <Link
                href="/como-funciona#agregar-a-inicio"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#cfeaf5] bg-white px-5 py-2.5 text-sm font-black text-[#0089bb] transition-colors hover:bg-[#EBF5FB] sm:w-auto"
              >
                <BookOpen className="h-4 w-4" />
                {t("homeGuideLink")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function InstallHomeLink() {
  const t = useTranslations("installGuide");
  const { canPrompt, installed, install } = useInstallPrompt();

  return (
    <div className="rounded-2xl bg-[#f4fbfe] p-4">
      <p className="font-bold leading-snug text-[#1a2744]">{t("homeTitle")}</p>
      <p className="mt-1 text-sm leading-relaxed text-[#6b7280]">{t("homeBody")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <InstallAction canPrompt={canPrompt} installed={installed} install={install} />
        <Link href="/como-funciona#agregar-a-inicio" className="text-sm font-bold text-[#009FD9] hover:underline">
          {t("homeGuideLink")}
        </Link>
      </div>
    </div>
  );
}

type InstallMockStep = "menu" | "share" | "home";

const highlightedRowClass = "border-[#9be3fb] bg-[#EAF7FD] text-[#0089bb] ring-2 ring-[#009FD9]/75 shadow-[0_10px_24px_rgba(0,159,217,0.18)]";

function InstallPhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-full max-w-[238px] rounded-[2.1rem] bg-[#162543] p-2 shadow-[0_22px_55px_-32px_rgba(15,23,42,0.78)]">
      <div className="overflow-hidden rounded-[1.6rem] bg-[#f8fbfd] ring-1 ring-white/10">
        <div className="flex items-center justify-between bg-white px-5 pb-2 pt-3 text-[10px] font-bold text-[#162543]">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm bg-[#162543]" />
            <span className="h-2 w-4 rounded-sm border border-[#162543]" />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

function MiniContrataPage({ searchLabel, searchButton }: { searchLabel: string; searchButton: string }) {
  return (
    <div className="px-4 pb-20 pt-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.png" alt="" className="h-5 w-5" />
          <span className="text-sm font-black text-[#162543]">
            Contrata<span className="text-[#009FD9]">CR</span>
          </span>
        </span>
        <span className="grid h-8 w-8 place-items-center rounded-full bg-white text-[#162543] shadow-sm">
          <Ellipsis className="h-4 w-4 rotate-90" />
        </span>
      </div>
      <div className="mt-9 rounded-2xl bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] px-3 py-3 text-[#9ca3af]">
          <Search className="h-4 w-4" />
          <span className="text-xs">{searchLabel}</span>
        </div>
        <button className="mt-3 w-full rounded-xl bg-[#009FD9] py-3 text-xs font-black text-white">{searchButton}</button>
      </div>
      <div className="mt-5 rounded-[1.6rem] bg-[#EBF5FB] p-4">
        <p className="text-lg font-black leading-tight text-[#162543]">ContrataCR</p>
        <p className="mt-1 text-xs leading-relaxed text-[#5f6b7a]">contratacr.com</p>
      </div>
    </div>
  );
}

function BrowserToolbar({ highlightMenu = false }: { highlightMenu?: boolean }) {
  return (
    <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-full bg-white/95 p-2 shadow-[0_12px_28px_rgba(15,23,42,0.16)] backdrop-blur">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-[#f3f4f6] text-lg font-bold text-[#162543]">&lt;</span>
      <span className="min-w-0 flex-1 truncate rounded-full bg-[#f8fbfd] px-3 py-2 text-center text-xs font-black text-[#162543]">
        contratacr.com
      </span>
      <span
        className={`grid h-9 w-9 place-items-center rounded-full transition-colors ${
          highlightMenu ? "bg-[#009FD9] text-white ring-4 ring-[#009FD9]/20 shadow-[0_8px_18px_rgba(0,159,217,0.32)]" : "bg-[#f3f4f6] text-[#162543]"
        }`}
      >
        <Ellipsis className="h-5 w-5" />
      </span>
    </div>
  );
}

function MockMenuRow({
  icon: Icon,
  label,
  active = false,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
}) {
  const t = useTranslations("installGuide");
  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-bold ${active ? highlightedRowClass : "border-transparent text-[#374151]"}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{label}</span>
      {active ? <span className="rounded-full bg-[#009FD9] px-2 py-0.5 text-[9px] font-black text-white">{t("tapHere")}</span> : null}
    </div>
  );
}

function InstallStepMock({ step }: { step: InstallMockStep }) {
  const t = useTranslations("installGuide");
  const page = <MiniContrataPage searchLabel={t("visualSearch")} searchButton={t("visualSearchButton")} />;

  return (
    <InstallPhoneFrame>
      <div className="relative h-[420px] overflow-hidden bg-[#f8fbfd]">
        {page}

        {step === "menu" ? <BrowserToolbar highlightMenu /> : null}

        {step === "share" ? (
          <>
            <div aria-hidden className="absolute inset-0 bg-[#162543]/18 backdrop-blur-[1px]" />
            <div className="absolute inset-x-4 bottom-16 rounded-[1.6rem] bg-white/95 p-2 shadow-[0_18px_45px_rgba(15,23,42,0.26)]">
              <MockMenuRow icon={Share2} label={t("iosVisualShare")} active />
              <MockMenuRow icon={Bookmark} label={t("iosBookmark")} />
              <MockMenuRow icon={BookOpen} label={t("iosReader")} />
              <MockMenuRow icon={Copy} label={t("iosNewTab")} />
            </div>
            <BrowserToolbar />
          </>
        ) : null}

        {step === "home" ? (
          <>
            <div aria-hidden className="absolute inset-0 bg-[#162543]/24 backdrop-blur-[1px]" />
            <div className="absolute inset-x-4 top-8 rounded-[1.5rem] bg-white/90 p-3 shadow-[0_14px_34px_rgba(15,23,42,0.22)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-white shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/logo-mark.png" alt="" className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#162543]">ContrataCR</p>
                  <p className="truncate text-xs text-[#6b7280]">contratacr.com</p>
                </div>
              </div>
            </div>
            <div className="absolute inset-x-4 bottom-7 rounded-[1.6rem] bg-white/95 p-2 shadow-[0_18px_45px_rgba(15,23,42,0.26)]">
              <MockMenuRow icon={BookOpen} label={t("iosAddBookmark")} />
              <MockMenuRow icon={Bookmark} label={t("iosFavorite")} />
              <MockMenuRow icon={Search} label={t("iosFindPage")} />
              <MockMenuRow icon={Home} label={t("iosVisualAdd")} active />
            </div>
          </>
        ) : null}
      </div>
    </InstallPhoneFrame>
  );
}

function InstallStepCard({ number, title, body, step }: { number: number; title: string; body: string; step: InstallMockStep }) {
  return (
    <article className="rounded-3xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5">
      <InstallStepMock step={step} />
      <div className="mt-4 flex gap-3">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#009FD9] text-xs font-black text-white">
          {number}
        </span>
        <div>
          <h4 className="text-sm font-black leading-snug text-[#162543]">{title}</h4>
          <p className="mt-1 text-sm leading-relaxed text-[#6b7280]">{body}</p>
        </div>
      </div>
    </article>
  );
}

function IosScreenshotGuide() {
  const t = useTranslations("installGuide");
  const steps = [
    {
      title: t("iosStep1Title"),
      body: t("iosStep1Body"),
      step: "menu" as const,
    },
    {
      title: t("iosStep2Title"),
      body: t("iosStep2Body"),
      step: "share" as const,
    },
    {
      title: t("iosStep3Title"),
      body: t("iosStep3Body"),
      step: "home" as const,
    },
  ];

  return (
    <div>
      <div className="mb-5 max-w-3xl">
        <h3 className="text-xl font-black text-[#162543]">{t("iosTitle")}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#6b7280] sm:text-base">{t("iosBody")}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {steps.map((step, index) => (
          <InstallStepCard
            key={step.title}
            number={index + 1}
            title={step.title}
            body={step.body}
            step={step.step}
          />
        ))}
      </div>
    </div>
  );
}

export function InstallAppGuide({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("installGuide");
  const { canPrompt, installed, install } = useInstallPrompt();

  return (
    <section id="agregar-a-inicio" className={compact ? "py-10" : "bg-[#f8fbfd] px-4 py-16"}>
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#009FD9]">{t("eyebrow")}</p>
          <h2 className="mt-2 text-2xl font-extrabold leading-tight text-[#162543] sm:text-3xl">{t("title")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#6b7280] sm:text-base">{t("subtitle")}</p>
          <div className="mt-4 flex justify-center">
            <InstallAction canPrompt={canPrompt} installed={installed} install={install} />
          </div>
        </div>

        <div className="space-y-8">
          <IosScreenshotGuide />
        </div>
      </div>
    </section>
  );
}
