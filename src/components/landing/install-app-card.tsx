"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Download, MonitorDown, Plus, Share2, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";

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
    // iOS Safari exposes this non-standard flag when launched from Home Screen.
    ("standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

export function InstallAppCard() {
  const t = useTranslations("landing.howItWorks.install");
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

  const canPrompt = Boolean(installEvent) && !standalone && !installed;

  async function install() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice.catch(() => null);
    if (choice?.outcome === "accepted") {
      setInstalled(true);
    }
    setInstallEvent(null);
  }

  const rows = isIos
    ? [
        { Icon: Share2, text: t("iosStep1") },
        { Icon: Plus, text: t("iosStep2") },
      ]
    : [
        { Icon: MonitorDown, text: t("androidStep1") },
        { Icon: Plus, text: t("androidStep2") },
      ];

  return (
    <div className="mt-5 rounded-2xl border border-[#d8edf7] bg-[#f4fbfe] p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#ccecf8] bg-white text-[#0089bb] shadow-[0_8px_20px_-18px_rgba(0,159,217,0.9)]">
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold leading-snug text-[#1a2744]">{t("title")}</p>
          <p className="mt-1 text-sm leading-relaxed text-[#6b7280]">{t("body")}</p>

          {standalone || installed ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#15803d] ring-1 ring-[#bbf7d0]">
              <CheckCircle2 className="h-4 w-4" />
              {t("installed")}
            </div>
          ) : canPrompt ? (
            <button
              type="button"
              onClick={install}
              className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#009FD9] bg-white px-4 py-2 text-sm font-bold text-[#0089bb] shadow-sm transition-colors hover:bg-[#EBF5FB]"
            >
              <Download className="h-4 w-4" />
              {t("cta")}
            </button>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {rows.map(({ Icon, text }) => (
                <div key={text} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium text-[#374151] ring-1 ring-[#e5eef4]">
                  <Icon className="h-4 w-4 shrink-0 text-[#0089bb]" />
                  <span className="min-w-0">{text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
