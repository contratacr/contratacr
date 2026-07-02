"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  BookOpen,
  Download,
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

function ScreenshotStepCard({
  number,
  title,
  body,
  image,
  labelClassName,
  targetClassName,
}: {
  number: number;
  title: string;
  body: string;
  image: string;
  labelClassName: string;
  targetClassName: string;
}) {
  const t = useTranslations("installGuide");

  return (
    <article className="rounded-3xl border border-[#e5e7eb] bg-white p-4 shadow-sm sm:p-5">
      <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-[1.65rem] bg-white shadow-[0_18px_48px_-30px_rgba(15,23,42,0.75)] ring-1 ring-[#dbe3ec]">
        <Image
          src={image}
          alt=""
          width={588}
          height={1280}
          sizes="(min-width: 1024px) 280px, 78vw"
          className="h-auto w-full select-none"
          priority={number === 1}
        />
        <span
          aria-hidden
          className={`pointer-events-none absolute z-20 border-2 border-[#009FD9] bg-[#009FD9]/12 shadow-[0_0_0_5px_rgba(0,159,217,0.14),0_10px_24px_rgba(0,159,217,0.24)] ${targetClassName}`}
        />
        <span className={`absolute z-20 rounded-full bg-[#009FD9] px-2.5 py-1 text-[10px] font-black text-white shadow-[0_8px_22px_rgba(0,159,217,0.35)] ${labelClassName}`}>
          {t("tapHere")}
        </span>
      </div>
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
      image: "/install-guide/add-home-step-1.jpg",
      targetClassName: "bottom-[3.8%] right-[2.8%] h-[8.2%] w-[16%] rounded-[1.6rem]",
      labelClassName: "bottom-[13.2%] right-[5.5%]",
    },
    {
      title: t("iosStep2Title"),
      body: t("iosStep2Body"),
      image: "/install-guide/add-home-step-2.jpg",
      targetClassName: "left-[31%] top-[50.8%] h-[4.8%] w-[56%] rounded-2xl",
      labelClassName: "left-1/2 top-[45%] -translate-x-1/2",
    },
    {
      title: t("iosStep3Title"),
      body: t("iosStep3Body"),
      image: "/install-guide/add-home-step-3.jpg",
      targetClassName: "left-[5.8%] top-[56.9%] h-[5.7%] w-[59%] rounded-xl",
      labelClassName: "right-[9%] top-[51.2%]",
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
          <ScreenshotStepCard
            key={step.title}
            number={index + 1}
            title={step.title}
            body={step.body}
            image={step.image}
            labelClassName={step.labelClassName}
            targetClassName={step.targetClassName}
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
