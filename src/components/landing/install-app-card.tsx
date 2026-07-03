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
  targetClassName,
  labelClassName,
}: {
  number: number;
  title: string;
  body: string;
  image: string;
  targetClassName: string;
  labelClassName: string;
}) {
  const t = useTranslations("installGuide");

  return (
    <article className="min-w-0">
      <div className="relative mx-auto w-full max-w-[284px]">
        <div aria-hidden className="absolute -left-[2px] top-[118px] h-8 w-[3px] rounded-l-sm bg-[#2b2f36]" />
        <div aria-hidden className="absolute -left-[2px] top-[166px] h-12 w-[3px] rounded-l-sm bg-[#2b2f36]" />
        <div aria-hidden className="absolute -right-[2px] top-[154px] h-16 w-[3px] rounded-r-sm bg-[#2b2f36]" />
        <div
          className="relative"
          style={{
            background: "linear-gradient(135deg,#f1f3f6 0%,#c6cbd2 18%,#777c85 50%,#c6cbd2 82%,#f1f3f6 100%)",
            borderRadius: 56,
            padding: 3,
            boxShadow:
              "0 50px 100px -28px rgba(15,23,42,0.38), 0 24px 48px -22px rgba(15,23,42,0.34), inset 0 0 0 0.5px rgba(255,255,255,0.45)",
          }}
        >
          <div className="relative bg-[#04060a]" style={{ borderRadius: 53, padding: 8 }}>
            <div className="relative overflow-hidden bg-white" style={{ borderRadius: 46 }}>
              <Image
                src={image}
                alt=""
                width={588}
                height={1280}
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

function IosScreenshotGuide() {
  const t = useTranslations("installGuide");
  const steps = [
    {
      title: t("iosStep1Title"),
      body: t("iosStep1Body"),
      image: "/install-guide/install-ios-step-1.jpg",
      targetClassName: "bottom-[3.45%] right-[7.8%] h-[6.15%] w-[13.2%] rounded-full",
      labelClassName: "bottom-[11.05%] right-[8.6%]",
    },
    {
      title: t("iosStep2Title"),
      body: t("iosStep2Body"),
      image: "/install-guide/install-ios-step-2.jpg",
      targetClassName: "left-[30.2%] top-[52.05%] h-[5.45%] w-[56.6%] rounded-2xl",
      labelClassName: "right-[9%] top-[48.85%]",
    },
    {
      title: t("iosStep3Title"),
      body: t("iosStep3Body"),
      image: "/install-guide/install-ios-step-3.jpg",
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
