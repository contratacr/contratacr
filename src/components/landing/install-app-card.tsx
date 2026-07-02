"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CheckCircle2, Download, Menu, MonitorDown, MoreVertical, Plus, Share2, Smartphone } from "lucide-react";
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

export function InstallHomeLink() {
  const t = useTranslations("installGuide");
  const { canPrompt, installed, install } = useInstallPrompt();

  return (
    <div className="mt-5 rounded-2xl border border-[#d8edf7] bg-[#f4fbfe] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-white text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug text-[#1a2744]">{t("homeTitle")}</p>
          <p className="mt-1 text-sm leading-relaxed text-[#6b7280]">{t("homeBody")}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {installed ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#15803d] ring-1 ring-[#bbf7d0]">
                <CheckCircle2 className="h-4 w-4" />
                {t("installed")}
              </span>
            ) : canPrompt ? (
              <button
                type="button"
                onClick={install}
                className="inline-flex items-center gap-2 rounded-full border border-[#009FD9] bg-white px-4 py-2 text-sm font-bold text-[#0089bb] shadow-sm transition-colors hover:bg-[#EBF5FB]"
              >
                <Download className="h-4 w-4" />
                {t("installCta")}
              </button>
            ) : null}
            <Link href="/como-funciona#agregar-a-inicio" className="text-sm font-bold text-[#009FD9] hover:underline">
              {t("homeGuideLink")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function VisualPhone({ platform }: { platform: "ios" | "android" }) {
  const t = useTranslations("installGuide");
  const isIos = platform === "ios";

  return (
    <div className="mx-auto w-full max-w-[300px] rounded-[2rem] border border-[#dbe3ec] bg-[#111827] p-2 shadow-[0_24px_70px_-38px_rgba(15,23,42,0.65)]">
      <div className="overflow-hidden rounded-[1.55rem] bg-white">
        <div className="flex items-center justify-between border-b border-[#eef1f5] px-4 py-3">
          <div className="flex items-center gap-2">
            <Image src="/logo-mark.png" alt="" width={20} height={20} className="h-5 w-5" />
            <span className="text-xs font-bold text-[#162543]">contratacr.com</span>
          </div>
          {isIos ? <Share2 className="h-4 w-4 text-[#009FD9]" /> : <MoreVertical className="h-4 w-4 text-[#6b7280]" />}
        </div>

        <div className="space-y-3 bg-[#f8fbfd] p-4">
          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-3">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[#EBF5FB] text-xs font-bold text-[#009FD9]">CR</span>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight text-[#162543]">ContrataCR</p>
                <p className="text-xs text-[#6b7280]">{t("mockAppLine")}</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-[#e5e7eb]">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-[#9ca3af]">
              {isIos ? t("iosSheetTitle") : t("androidSheetTitle")}
            </p>
            <div className="flex items-center gap-3 rounded-xl bg-[#EBF5FB] px-3 py-2.5">
              {isIos ? <Share2 className="h-4 w-4 text-[#0089bb]" /> : <MonitorDown className="h-4 w-4 text-[#0089bb]" />}
              <span className="text-sm font-bold text-[#162543]">
                {isIos ? t("iosVisualAction") : t("androidVisualAction")}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5">
              {isIos ? <Plus className="h-4 w-4 text-[#0089bb]" /> : <Menu className="h-4 w-4 text-[#0089bb]" />}
              <span className="text-sm font-semibold text-[#374151]">
                {isIos ? t("iosVisualConfirm") : t("androidVisualConfirm")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformGuideCard({
  platform,
  title,
  body,
  steps,
}: {
  platform: "ios" | "android";
  title: string;
  body: string;
  steps: string[];
}) {
  return (
    <div className="rounded-3xl border border-[#e5e7eb] bg-white p-5 shadow-sm sm:p-6">
      <VisualPhone platform={platform} />
      <div className="mt-5">
        <h3 className="text-lg font-black text-[#162543]">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">{body}</p>
        <ol className="mt-4 space-y-2">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#009FD9] text-xs font-black text-white">
                {index + 1}
              </span>
              <span className="text-sm font-medium leading-relaxed text-[#374151]">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function InstallAppGuide({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("installGuide");
  const { canPrompt, installed, isIos, install } = useInstallPrompt();

  const iosSteps = [t("iosStep1"), t("iosStep2"), t("iosStep3")];
  const androidSteps = [t("androidStep1"), t("androidStep2"), t("androidStep3")];

  return (
    <section id="agregar-a-inicio" className={compact ? "py-10" : "bg-[#f8fbfd] px-4 py-16"}>
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#009FD9]">{t("eyebrow")}</p>
          <h2 className="mt-2 text-2xl font-extrabold leading-tight text-[#162543] sm:text-3xl">{t("title")}</h2>
          <p className="mt-3 text-sm leading-relaxed text-[#6b7280] sm:text-base">{t("subtitle")}</p>
          {installed ? (
            <span className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#15803d] ring-1 ring-[#bbf7d0]">
              <CheckCircle2 className="h-4 w-4" />
              {t("installed")}
            </span>
          ) : canPrompt ? (
            <button
              type="button"
              onClick={install}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-[#009FD9] px-5 py-2.5 text-sm font-black text-white shadow-[0_10px_24px_rgba(0,159,217,0.22)] transition-colors hover:bg-[#0089bb]"
            >
              <Download className="h-4 w-4" />
              {t("installCta")}
            </button>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <PlatformGuideCard
            platform="ios"
            title={t("iosTitle")}
            body={isIos ? t("iosBodyCurrent") : t("iosBody")}
            steps={iosSteps}
          />
          <PlatformGuideCard
            platform="android"
            title={t("androidTitle")}
            body={!isIos ? t("androidBodyCurrent") : t("androidBody")}
            steps={androidSteps}
          />
        </div>
      </div>
    </section>
  );
}
