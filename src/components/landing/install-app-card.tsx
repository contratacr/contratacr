"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Download,
} from "lucide-react";
import { useTranslations } from "next-intl";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallPlatform = "ios" | "android";

type ScreenshotStep = {
  title: string;
  body: string;
  image: string;
  width: number;
  height: number;
  targetClassName: string;
  labelClassName: string;
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

function ScreenshotStepCard({
  number,
  title,
  body,
  image,
  platform,
  width,
  height,
  targetClassName,
  labelClassName,
}: {
  number: number;
  title: string;
  body: string;
  image: string;
  platform: InstallPlatform;
  width: number;
  height: number;
  targetClassName: string;
  labelClassName: string;
}) {
  const t = useTranslations("installGuide");
  const isAndroid = platform === "android";

  return (
    <article className="min-w-0">
      <div className={`relative mx-auto w-full ${isAndroid ? "max-w-[270px]" : "max-w-[284px]"}`}>
        {!isAndroid ? (
          <>
            <div aria-hidden className="absolute -left-[2px] top-[118px] h-8 w-[3px] rounded-l-sm bg-[#2b2f36]" />
            <div aria-hidden className="absolute -left-[2px] top-[166px] h-12 w-[3px] rounded-l-sm bg-[#2b2f36]" />
            <div aria-hidden className="absolute -right-[2px] top-[154px] h-16 w-[3px] rounded-r-sm bg-[#2b2f36]" />
          </>
        ) : null}
        <div
          className="relative"
          style={
            isAndroid
              ? {
                  background: "linear-gradient(135deg,#23314d 0%,#0f172a 48%,#1f2a44 100%)",
                  borderRadius: 30,
                  padding: 5,
                  boxShadow:
                    "0 42px 90px -34px rgba(15,23,42,0.42), 0 20px 44px -28px rgba(15,23,42,0.36)",
                }
              : {
                  background: "linear-gradient(135deg,#f1f3f6 0%,#c6cbd2 18%,#777c85 50%,#c6cbd2 82%,#f1f3f6 100%)",
                  borderRadius: 56,
                  padding: 3,
                  boxShadow:
                    "0 50px 100px -28px rgba(15,23,42,0.38), 0 24px 48px -22px rgba(15,23,42,0.34), inset 0 0 0 0.5px rgba(255,255,255,0.45)",
                }
          }
        >
          <div className="relative bg-[#04060a]" style={{ borderRadius: isAndroid ? 26 : 53, padding: isAndroid ? 5 : 8 }}>
            <div className="relative overflow-hidden bg-white" style={{ borderRadius: isAndroid ? 22 : 46 }}>
              <Image
                src={image}
                alt=""
                width={width}
                height={height}
                sizes="(min-width: 1024px) 284px, 78vw"
                className="h-auto w-full select-none"
                priority={number === 1}
              />
              <span
                aria-hidden
                className={`pointer-events-none absolute z-20 border-2 border-[#009FD9] bg-[#009FD9]/10 shadow-[0_0_0_5px_rgba(0,159,217,0.14),0_10px_24px_rgba(0,159,217,0.24)] ${targetClassName}`}
              />
              <span className={`pointer-events-none absolute z-30 rounded-full bg-[#009FD9] px-2.5 py-1 text-[9px] font-black text-white shadow-[0_8px_22px_rgba(0,159,217,0.35)] ${labelClassName}`}>
                {t("tapHere")}
              </span>
            </div>
          </div>
        </div>
      </div>
      <div className="mx-auto mt-5 flex max-w-[284px] gap-3">
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

function ScreenshotGuide({ platform }: { platform: InstallPlatform }) {
  const t = useTranslations("installGuide");
  const steps: ScreenshotStep[] =
    platform === "android"
      ? [
          {
            title: t("androidStep1Title"),
            body: t("androidStep1Body"),
            image: "/install-guide/install-android-step-1.jpg",
            width: 576,
            height: 1280,
            targetClassName: "right-[3.2%] top-[4.8%] h-[4.1%] w-[8.4%] rounded-full",
            labelClassName: "right-[5.8%] top-[9.4%]",
          },
          {
            title: t("androidStep2Title"),
            body: t("androidStep2Body"),
            image: "/install-guide/install-android-step-2.jpg",
            width: 576,
            height: 1280,
            targetClassName: "left-[35.2%] top-[68.25%] h-[5.9%] w-[58.8%] rounded-2xl",
            labelClassName: "right-[6.2%] top-[65.35%]",
          },
          {
            title: t("androidStep3Title"),
            body: t("androidStep3Body"),
            image: "/install-guide/install-android-step-3.jpg",
            width: 576,
            height: 1280,
            targetClassName: "left-[5.4%] top-[74.6%] h-[8.35%] w-[89.2%] rounded-2xl",
            labelClassName: "right-[8.2%] top-[71.55%]",
          },
        ]
      : [
          {
            title: t("iosStep1Title"),
            body: t("iosStep1Body"),
            image: "/install-guide/install-ios-step-1.jpg",
            width: 588,
            height: 1280,
            targetClassName: "bottom-[3.45%] right-[7.8%] h-[6.15%] w-[13.2%] rounded-full",
            labelClassName: "bottom-[11.05%] right-[8.6%]",
          },
          {
            title: t("iosStep2Title"),
            body: t("iosStep2Body"),
            image: "/install-guide/install-ios-step-2.jpg",
            width: 588,
            height: 1280,
            targetClassName: "left-[30.2%] top-[52.05%] h-[5.45%] w-[56.6%] rounded-2xl",
            labelClassName: "right-[9%] top-[48.85%]",
          },
          {
            title: t("iosStep3Title"),
            body: t("iosStep3Body"),
            image: "/install-guide/install-ios-step-3.jpg",
            width: 588,
            height: 1280,
            targetClassName: "left-[4.2%] top-[50.55%] h-[6.75%] w-[91.5%] rounded-2xl",
            labelClassName: "right-[8%] top-[52.25%]",
          },
        ];

  return (
    <div>
      <div className="grid gap-4 lg:grid-cols-3">
        {steps.map((step, index) => (
          <ScreenshotStepCard
            key={step.title}
            number={index + 1}
            title={step.title}
            body={step.body}
            image={step.image}
            platform={platform}
            width={step.width}
            height={step.height}
            targetClassName={step.targetClassName}
            labelClassName={step.labelClassName}
          />
        ))}
      </div>
    </div>
  );
}

export function InstallAppGuide({ compact = false }: { compact?: boolean }) {
  const t = useTranslations("installGuide");
  const { canPrompt, installed, install } = useInstallPrompt();
  const [platform, setPlatform] = useState<InstallPlatform>("ios");

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
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#7b8794]">{t("platformLabel")}</p>
            <div
              role="tablist"
              aria-label={t("platformLabel")}
              className="inline-flex rounded-full border border-[#d9e5ee] bg-white p-1 shadow-[0_12px_30px_rgba(15,35,67,0.08)]"
            >
              {(["ios", "android"] as InstallPlatform[]).map((option) => {
                const selected = platform === option;
                return (
                  <button
                    key={option}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setPlatform(option)}
                    className={`min-w-[104px] rounded-full px-5 py-2 text-sm font-black transition-colors ${
                      selected ? "bg-[#009FD9] text-white shadow-[0_8px_18px_rgba(0,159,217,0.22)]" : "text-[#162543] hover:bg-[#eef7fc]"
                    }`}
                  >
                    {option === "ios" ? t("iosTab") : t("androidTab")}
                  </button>
                );
              })}
            </div>
          </div>
          <ScreenshotGuide platform={platform} />
        </div>
      </div>
    </section>
  );
}
