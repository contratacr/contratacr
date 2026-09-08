"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { Link2, QrCode, Star, ChevronRight, ArrowLeft, Check } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/utils";

/**
 * Kit para que el profesional traiga a sus propios clientes: enlace, tarjeta
 * con QR lista para estados y redes, y un mensaje para pedir reseñas. Los
 * profesionales son quienes ya tienen clientes; con esto los traen al app.
 */
type Props = {
  open: boolean;
  onClose: () => void;
  profileUrl: string;
  name: string;
  categoryLabel?: string;
  avatarUrl?: string | null;
  isVerified?: boolean;
  ratingAvg?: number;
  reviewCount?: number;
};

type View = "menu" | "card" | "reviews";

const CARD_W = 1080;
const CARD_H = 1350;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, startSize: number, weight = "800", minSize = 28) {
  let size = startSize;
  do {
    ctx.font = `${weight} ${size}px Inter, -apple-system, "Segoe UI", Roboto, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  } while (size > minSize);
  return size;
}

export function ShareKit({ open, onClose, profileUrl, name, categoryLabel, avatarUrl, isVerified, ratingAvg = 0, reviewCount = 0 }: Props) {
  const t = useTranslations("shareKit");
  const [view, setView] = useState<View>("menu");
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const [cardBlob, setCardBlob] = useState<Blob | null>(null);
  const [cardPreview, setCardPreview] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);


  // La tarjeta se dibuja en un canvas al abrir esa vista: foto, nombre, oficio,
  // calificación y el QR grande al perfil. Si la foto no permite CORS se usan
  // las iniciales, para que la imagen siempre pueda exportarse.
  useEffect(() => {
    if (view !== "card" || cardBlob) return;
    let cancelled = false;
    (async () => {
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      canvas.width = CARD_W; canvas.height = CARD_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#f4f7fa"; ctx.fillRect(0, 0, CARD_W, CARD_H);
      // Tarjeta blanca con banda marino arriba: el nombre de la marca en blanco
      // y "CR" en turquesa, como el logotipo.
      ctx.fillStyle = "#ffffff"; roundRect(ctx, 60, 60, CARD_W - 120, CARD_H - 120, 48); ctx.fill();
      ctx.save(); roundRect(ctx, 60, 60, CARD_W - 120, 200, 48); ctx.clip();
      ctx.fillStyle = "#162543"; ctx.fillRect(60, 60, CARD_W - 120, 200); ctx.restore();
      ctx.font = "800 64px Inter, -apple-system, \"Segoe UI\", Roboto, sans-serif"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
      const wContrata = ctx.measureText("Contrata").width; const wCR = ctx.measureText("CR").width;
      const x0 = (CARD_W - wContrata - wCR) / 2;
      ctx.fillStyle = "#ffffff"; ctx.fillText("Contrata", x0, 128);
      ctx.fillStyle = "#009FD9"; ctx.fillText("CR", x0 + wContrata, 128);
      // Foto centrada sobre el borde de la banda
      const cx = CARD_W / 2; const R = 120; const fotoCy = 260 + 100;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, fotoCy, R + 10, 0, Math.PI * 2); ctx.fillStyle = "#ffffff"; ctx.fill(); ctx.restore();
      const avatar = avatarUrl ? await loadImage(`/api/media/canvas?url=${encodeURIComponent(avatarUrl)}`) : null;
      ctx.save(); ctx.beginPath(); ctx.arc(cx, fotoCy, R, 0, Math.PI * 2); ctx.clip();
      if (avatar) {
        const s = Math.max((R * 2) / avatar.width, (R * 2) / avatar.height);
        ctx.drawImage(avatar, cx - (avatar.width * s) / 2, fotoCy - (avatar.height * s) / 2, avatar.width * s, avatar.height * s);
      } else {
        ctx.fillStyle = "#EBF5FB"; ctx.fillRect(cx - R, fotoCy - R, R * 2, R * 2);
        ctx.fillStyle = "#009FD9"; ctx.font = "800 90px Inter, -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(getInitials(name), cx, fotoCy);
      }
      ctx.restore();
      // Nombre, verificado, oficio, calificación
      let y = fotoCy + R + 40;
      ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.fillStyle = "#162543";
      const size = fitText(ctx, name, CARD_W - 200, 58);
      y += size; ctx.fillText(name, cx, y);
      if (isVerified) { y += 44; ctx.font = "700 30px Inter, -apple-system, sans-serif"; ctx.fillStyle = "#0089bb"; ctx.fillText(`✓ ${t("cardTrust")}`, cx, y); }
      if (categoryLabel) { y += 46; ctx.font = "600 34px Inter, -apple-system, sans-serif"; ctx.fillStyle = "#52627a"; ctx.fillText(categoryLabel, cx, y); }
      if (reviewCount > 0) { y += 46; ctx.font = "700 32px Inter, -apple-system, sans-serif"; ctx.fillStyle = "#162543"; ctx.fillText(`★ ${ratingAvg.toFixed(1)} · ${reviewCount} ${reviewCount === 1 ? "reseña" : "reseñas"}`, cx, y); }
      // QR anclado al pie: el pie (texto + URL) se reserva primero, el QR va arriba.
      const pieUrlY = CARD_H - 60 - 48; const pieTextY = pieUrlY - 44;
      const qrSize = Math.min(420, pieTextY - 40 - (y + 40) - 24);
      const qrY = pieTextY - 40 - qrSize - 16;
      const qrData = await QRCode.toDataURL(profileUrl, { margin: 1, width: qrSize, color: { dark: "#162543", light: "#ffffff" }, errorCorrectionLevel: "M" });
      const qrImg = await loadImage(qrData);
      if (qrImg) {
        ctx.save(); ctx.fillStyle = "#ffffff"; roundRect(ctx, cx - qrSize / 2 - 16, qrY - 16, qrSize + 32, qrSize + 32, 28); ctx.fill();
        ctx.strokeStyle = "#dbe4ee"; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
        ctx.drawImage(qrImg, cx - qrSize / 2, qrY, qrSize, qrSize);
      }
      ctx.font = "700 30px Inter, -apple-system, sans-serif"; ctx.fillStyle = "#162543"; ctx.fillText(t("cardFooter"), cx, pieTextY);
      const urlCorta = profileUrl.replace(/^https?:\/\//, "");
      fitText(ctx, urlCorta, CARD_W - 200, 26, "600", 16); ctx.fillStyle = "#68778d"; ctx.fillText(urlCorta, cx, pieUrlY);
      try {
        canvas.toBlob((blob) => {
          if (cancelled || !blob) return;
          setCardBlob(blob);
          setCardPreview(URL.createObjectURL(blob));
        }, "image/png");
      } catch {
        // Canvas contaminado por una foto sin CORS: se reintenta sin foto.
      }
    })();
    return () => { cancelled = true; };
  }, [view, cardBlob, avatarUrl, categoryLabel, isVerified, name, profileUrl, ratingAvg, reviewCount, t]);

  async function copy(text: string, kind: "link" | "message") {
    try { await navigator.clipboard.writeText(text); setCopied(kind); window.setTimeout(() => setCopied(null), 1800); } catch { /* sin portapapeles */ }
  }

  async function shareLink() {
    if (navigator.share) { try { await navigator.share({ title: name, url: profileUrl }); return; } catch { /* cancelado */ } }
    await copy(profileUrl, "link");
  }

  async function shareCard() {
    if (!cardBlob) return;
    const file = new File([cardBlob], "contratacr-perfil.png", { type: "image/png" });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: name }); return; } catch { /* cancelado */ }
    }
    downloadCard();
  }

  function downloadCard() {
    if (!cardPreview) return;
    const a = document.createElement("a"); a.href = cardPreview; a.download = "contratacr-perfil.png"; a.click();
  }

  const reviewsUrl = `${profileUrl}?tab=resenas`;
  const reviewsMessage = t("reviewsMessage", { url: reviewsUrl });
  const waHref = `https://wa.me/?text=${encodeURIComponent(reviewsMessage)}`;

  const option = (Icon: typeof Link2, title: string, body: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3.5 rounded-2xl border border-[#e5eaf0] bg-white px-4 py-3.5 text-left transition-colors hover:border-[#bfe3f5] hover:bg-[#f8fcfe]">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#eaf7fc] text-[#009FD9]"><Icon className="h-5 w-5" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-[#162543]">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-[#52627a]">{body}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa8ba]" />
    </button>
  );

  // Al cerrar se vuelve al menú, para que la próxima apertura empiece limpia.
  const cerrar = () => { setView("menu"); setCopied(null); onClose(); };

  return (
    <Modal open={open} onClose={cerrar} title={t("title")} subtitle={view === "menu" ? t("subtitle") : undefined} size="sm" mobilePresentation="center" closeLabel={t("close")}>
      {view === "menu" && (
        <div className="flex flex-col gap-2.5">
          {option(Link2, t("linkTitle"), t("linkBody"), () => { void shareLink(); })}
          {option(QrCode, t("cardTitle"), t("cardBody"), () => setView("card"))}
          {option(Star, t("reviewsTitle"), t("reviewsBody"), () => setView("reviews"))}
          <Button type="button" variant="secondary" className="mt-1 w-full" onClick={() => void copy(profileUrl, "link")}>
            {copied === "link" ? <><Check className="h-4 w-4" />{t("copied")}</> : t("copy")}
          </Button>
        </div>
      )}
      {view === "card" && (
        <div className="flex flex-col items-center gap-3">
          {cardPreview ? (
            // eslint-disable-next-line @next/next/no-img-element -- imagen generada en el navegador
            <img src={cardPreview} alt="" className="w-full max-w-[280px] rounded-2xl border border-[#e5eaf0] shadow-sm" />
          ) : (
            <div className="grid aspect-[4/5] w-full max-w-[280px] animate-pulse place-items-center rounded-2xl bg-[#eef2f6] text-[13px] font-semibold text-[#68778d]">{t("preparing")}</div>
          )}
          <Button type="button" className="w-full" disabled={!cardBlob} onClick={() => void shareCard()}>{t("shareImage")}</Button>
          <Button type="button" variant="secondary" className="w-full" disabled={!cardPreview} onClick={downloadCard}>{t("download")}</Button>
          <button type="button" onClick={() => setView("menu")} className="mt-1 inline-flex items-center gap-1 text-[13px] font-bold text-[#52627a] hover:text-[#162543]"><ArrowLeft className="h-4 w-4" />{t("back")}</button>
        </div>
      )}
      {view === "reviews" && (
        <div className="flex flex-col gap-3">
          <p className="text-left text-[14px] leading-6 text-[#52627a]">{t("reviewsHint")}</p>
          <p className="rounded-2xl bg-[#f4f7fa] px-4 py-3 text-left text-[14px] leading-6 text-[#162543] [overflow-wrap:anywhere]">{reviewsMessage}</p>
          <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 w-full items-center justify-center rounded-full bg-[#25d366] px-5 text-[14px] font-bold text-white transition-colors hover:bg-[#1da851]">{t("sendWhatsApp")}</a>
          <Button type="button" variant="secondary" className="w-full" onClick={() => void copy(reviewsMessage, "message")}>
            {copied === "message" ? <><Check className="h-4 w-4" />{t("messageCopied")}</> : t("copyMessage")}
          </Button>
          <button type="button" onClick={() => setView("menu")} className="mt-1 inline-flex items-center gap-1 self-center text-[13px] font-bold text-[#52627a] hover:text-[#162543]"><ArrowLeft className="h-4 w-4" />{t("back")}</button>
        </div>
      )}
    </Modal>
  );
}
