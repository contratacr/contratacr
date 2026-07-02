"use client";

import { type ReactNode, useEffect, useState } from "react";
import Image from "next/image";
import {
  BookOpen,
  CheckCircle2,
  Download,
  Home,
  MonitorDown,
  MoreHorizontal,
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

type VisualKind =
  | "ios-browser"
  | "ios-menu"
  | "ios-share"
  | "android-browser"
  | "android-menu"
  | "android-confirm";

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

function LogoLine({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/logo-mark-transparent.png"
        alt=""
        width={compact ? 20 : 28}
        height={compact ? 20 : 28}
        className={compact ? "h-5 w-5" : "h-7 w-7"}
      />
      <span className={compact ? "text-sm font-extrabold leading-none tracking-tight" : "text-[19px] font-extrabold leading-none tracking-tight"}>
        <span className="text-[#1a2744]">Contrata</span>
        <span className="text-[#009FD9]">CR</span>
      </span>
    </div>
  );
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

  if (installed) {
    return (
      <span className={`inline-flex items-center justify-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-bold text-[#15803d] ring-1 ring-[#bbf7d0] ${className}`}>
        <CheckCircle2 className="h-4 w-4" />
        {t("installed")}
      </span>
    );
  }

  if (!canPrompt) return null;

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
    <section className="bg-white px-4 pb-16 pt-4 sm:px-6 sm:pb-20 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-[2rem] border border-[#d8edf7] bg-[#f8fbfd] shadow-[0_20px_60px_-42px_rgba(26,39,68,0.45)]">
          <div className="grid gap-6 p-5 sm:p-7 md:grid-cols-[1fr_auto] md:items-center lg:p-8">
            <div className="flex min-w-0 items-start gap-4">
              <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF7FD] text-[#0089bb] shadow-[0_12px_28px_-24px_rgba(0,159,217,0.95)]">
                <Smartphone className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#009FD9]">{t("homeEyebrow")}</p>
                <h2 className="mt-1 text-2xl font-extrabold leading-tight text-[#162543] sm:text-3xl">{t("homeTitle")}</h2>
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

function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[230px] overflow-hidden rounded-[1.65rem] bg-white shadow-[0_18px_48px_-30px_rgba(15,23,42,0.75)] ring-1 ring-[#dbe3ec]">
      <div className="flex items-center justify-between px-4 py-3 text-[10px] font-bold text-[#111827]">
        <span>1:09</span>
        <span className="tracking-[0.16em]">LTE</span>
      </div>
      {children}
    </div>
  );
}

function ClickCallout({ label, className = "" }: { label: string; className?: string }) {
  return (
    <span className={`absolute z-20 rounded-full bg-[#009FD9] px-2.5 py-1 text-[10px] font-black text-white shadow-[0_8px_22px_rgba(0,159,217,0.35)] ${className}`}>
      {label}
    </span>
  );
}

function BrowserPageVisual({ android = false }: { android?: boolean }) {
  const t = useTranslations("installGuide");

  return (
    <PhoneShell>
      <div className="border-y border-[#eef1f5] bg-white px-4 py-3">
        <LogoLine compact />
      </div>
      <div className="space-y-3 bg-[#f8fbfd] px-4 py-5">
        <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs text-[#9ca3af] ring-1 ring-[#e5e7eb]">
          <Search className="h-3.5 w-3.5" />
          {t("visualSearch")}
        </div>
        <div className="rounded-xl bg-[#009FD9] py-2 text-center text-xs font-black text-white">
          {t("visualSearchButton")}
        </div>
        <div className="h-20 rounded-t-full bg-gradient-to-b from-[#cfeaf5] to-white" />
      </div>
      <div className="relative flex items-center justify-between bg-white px-4 py-3 shadow-[0_-10px_24px_-22px_rgba(15,23,42,0.75)]">
        <span className="rounded-full bg-[#f3f4f6] px-3 py-2 text-[11px] font-bold text-[#374151]">contratacr.com</span>
        <span className="relative inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f3f4f6] text-[#162543]">
          {android ? <MoreHorizontal className="h-5 w-5 rotate-90" /> : <MoreHorizontal className="h-5 w-5" />}
          <span className="absolute inset-[-5px] rounded-full border-2 border-[#009FD9]" />
        </span>
        <ClickCallout label={t("tapHere")} className="-right-1 -top-7" />
      </div>
    </PhoneShell>
  );
}

function IosMenuVisual() {
  const t = useTranslations("installGuide");
  const rows = [t("iosVisualShare"), t("iosBookmark"), t("iosReader"), t("iosNewTab")];

  return (
    <PhoneShell>
      <div className="relative min-h-[270px] bg-[linear-gradient(180deg,#f8fbfd_0%,#f8fbfd_48%,#dff2fa_48%,#dff2fa_100%)] p-4">
        <div className="absolute inset-x-4 top-4">
          <LogoLine compact />
        </div>
        <div className="absolute bottom-5 left-1/2 w-[178px] -translate-x-1/2 rounded-[1.35rem] bg-[#1f2937]/88 p-3 text-white shadow-2xl backdrop-blur">
          {rows.map((row, index) => (
            <div
              key={row}
              className={index === 0 ? "relative flex items-center gap-2 rounded-xl bg-white/18 px-2.5 py-2 text-sm font-bold" : "flex items-center gap-2 px-2.5 py-2 text-xs text-white/80"}
            >
              {index === 0 ? <Share2 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              <span>{row}</span>
              {index === 0 ? <span className="absolute inset-0 rounded-xl border-2 border-[#38bdf8]" /> : null}
            </div>
          ))}
        </div>
        <ClickCallout label={t("iosVisualShare")} className="bottom-[72px] right-4" />
      </div>
    </PhoneShell>
  );
}

function IosShareVisual() {
  const t = useTranslations("installGuide");
  const rows = [t("iosAddBookmark"), t("iosFavorite"), t("iosFindPage"), t("iosVisualAdd")];

  return (
    <PhoneShell>
      <div className="relative min-h-[270px] bg-[#111827]/35 p-4">
        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-white/92 p-3 shadow-sm">
          <Image src="/logo-mark-transparent.png" alt="" width={34} height={34} className="h-9 w-9" />
          <div>
            <p className="text-xs font-black text-[#162543]">ContrataCR</p>
            <p className="text-[11px] text-[#6b7280]">contratacr.com</p>
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-[#1f2937]/92 p-2 text-white shadow-2xl">
          {rows.map((row, index) => (
            <div
              key={row}
              className={index === 3 ? "relative flex items-center gap-3 rounded-xl bg-white/16 px-3 py-2.5 text-sm font-bold" : "flex items-center gap-3 px-3 py-2.5 text-xs text-white/80"}
            >
              {index === 3 ? <Home className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
              <span>{row}</span>
              {index === 3 ? <span className="absolute inset-0 rounded-xl border-2 border-[#38bdf8]" /> : null}
            </div>
          ))}
        </div>
        <ClickCallout label={t("iosVisualAdd")} className="bottom-9 right-5" />
      </div>
    </PhoneShell>
  );
}

function AndroidMenuVisual() {
  const t = useTranslations("installGuide");
  const rows = [t("androidVisualInstall"), t("androidRefresh"), t("androidShare"), t("androidSettings")];

  return (
    <PhoneShell>
      <div className="relative min-h-[270px] bg-[#f8fbfd] p-4">
        <div className="flex items-center justify-between">
          <LogoLine compact />
          <MoreHorizontal className="h-5 w-5 rotate-90 text-[#162543]" />
        </div>
        <div className="absolute right-4 top-12 w-[180px] rounded-2xl bg-white p-2 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.75)] ring-1 ring-[#e5e7eb]">
          {rows.map((row, index) => (
            <div
              key={row}
              className={index === 0 ? "relative flex items-center gap-2 rounded-xl bg-[#EBF5FB] px-3 py-2.5 text-sm font-black text-[#162543]" : "flex items-center gap-2 px-3 py-2 text-xs text-[#6b7280]"}
            >
              {index === 0 ? <MonitorDown className="h-4 w-4 text-[#009FD9]" /> : <BookOpen className="h-4 w-4" />}
              <span>{row}</span>
              {index === 0 ? <span className="absolute inset-0 rounded-xl border-2 border-[#009FD9]" /> : null}
            </div>
          ))}
        </div>
        <ClickCallout label={t("androidVisualInstall")} className="right-5 top-[90px]" />
      </div>
    </PhoneShell>
  );
}

function AndroidConfirmVisual() {
  const t = useTranslations("installGuide");

  return (
    <PhoneShell>
      <div className="relative min-h-[270px] bg-[#f8fbfd] p-4">
        <div className="mt-8 rounded-2xl bg-white p-4 text-center shadow-[0_18px_50px_-30px_rgba(15,23,42,0.65)] ring-1 ring-[#e5e7eb]">
          <Image src="/logo-mark-transparent.png" alt="" width={44} height={44} className="mx-auto h-11 w-11" />
          <p className="mt-3 text-sm font-black text-[#162543]">ContrataCR</p>
          <p className="mt-1 text-xs text-[#6b7280]">contratacr.com</p>
          <div className="relative mt-4 flex items-center justify-center gap-2 rounded-full bg-[#009FD9] px-4 py-2 text-xs font-black text-white">
            <Home className="h-4 w-4" />
            {t("androidVisualConfirm")}
            <span className="absolute inset-[-4px] rounded-full border-2 border-[#38bdf8]" />
          </div>
        </div>
        <ClickCallout label={t("androidVisualConfirm")} className="bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap" />
      </div>
    </PhoneShell>
  );
}

function StepVisual({ kind }: { kind: VisualKind }) {
  if (kind === "ios-browser") return <BrowserPageVisual />;
  if (kind === "ios-menu") return <IosMenuVisual />;
  if (kind === "ios-share") return <IosShareVisual />;
  if (kind === "android-browser") return <BrowserPageVisual android />;
  if (kind === "android-menu") return <AndroidMenuVisual />;
  return <AndroidConfirmVisual />;
}

function VisualStepCard({
  number,
  title,
  body,
  visual,
}: {
  number: number;
  title: string;
  body: string;
  visual: VisualKind;
}) {
  return (
    <article className="rounded-3xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5">
      <StepVisual kind={visual} />
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

function PlatformGuide({
  title,
  body,
  steps,
}: {
  title: string;
  body: string;
  steps: Array<{ title: string; body: string; visual: VisualKind }>;
}) {
  return (
    <div>
      <div className="mb-5 max-w-3xl">
        <h3 className="text-xl font-black text-[#162543]">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#6b7280] sm:text-base">{body}</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {steps.map((step, index) => (
          <VisualStepCard key={step.title} number={index + 1} title={step.title} body={step.body} visual={step.visual} />
        ))}
      </div>
    </div>
  );
}

export function InstallAppGuide({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("installGuide");
  const { canPrompt, installed, isIos, install } = useInstallPrompt();

  const iosSteps = [
    { title: t("iosStep1Title"), body: t("iosStep1Body"), visual: "ios-browser" as const },
    { title: t("iosStep2Title"), body: t("iosStep2Body"), visual: "ios-menu" as const },
    { title: t("iosStep3Title"), body: t("iosStep3Body"), visual: "ios-share" as const },
  ];
  const androidSteps = [
    { title: t("androidStep1Title"), body: t("androidStep1Body"), visual: "android-browser" as const },
    { title: t("androidStep2Title"), body: t("androidStep2Body"), visual: "android-menu" as const },
    { title: t("androidStep3Title"), body: t("androidStep3Body"), visual: "android-confirm" as const },
  ];

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

        <div className="space-y-12">
          <PlatformGuide title={t("iosTitle")} body={isIos ? t("iosBodyCurrent") : t("iosBody")} steps={iosSteps} />
          <PlatformGuide title={t("androidTitle")} body={!isIos ? t("androidBodyCurrent") : t("androidBody")} steps={androidSteps} />
        </div>
      </div>
    </section>
  );
}
