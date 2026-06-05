"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface PhotoGalleryProps {
  professionalId: string;
  initialUrls?: string[];
  onSaved?: () => void;
}

const CLOUDINARY_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL; // reuse env check; actual Cloudinary check is server-side

export function PhotoGallery({ professionalId, initialUrls = [], onSaved }: PhotoGalleryProps) {
  const t = useTranslations("dashboard.pro.photos");
  const [urls, setUrls] = useState<string[]>(initialUrls);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(files: FileList) {
    const remaining = 10 - urls.length;
    const toUpload = Array.from(files).slice(0, Math.max(0, remaining));
    if (toUpload.length === 0) return;

    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of toUpload) {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/upload/photo", { method: "POST", body: formData });
        const data = await res.json();
        if (data.url) uploaded.push(data.url);
        else alert(data.error ?? t("configure"));
      }

      if (uploaded.length > 0) {
        const newUrls = [...urls, ...uploaded];
        setUrls(newUrls);
        const supabase = createClient();
        await supabase
          .from("professionals")
          .update({ portfolio_urls: newUrls })
          .eq("id", professionalId);
        onSaved?.();
      }
    } catch {
      alert(t("configure"));
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(url: string) {
    const newUrls = urls.filter((u) => u !== url);
    setUrls(newUrls);
    const supabase = createClient();
    await supabase
      .from("professionals")
      .update({ portfolio_urls: newUrls })
      .eq("id", professionalId);
    onSaved?.();
  }

  return (
    <div>
      <p className="text-sm text-[#6b7280] mb-5">{t("hint")}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {urls.map((url) => (
          <div key={url} className="relative group aspect-square rounded-2xl overflow-hidden border border-[#e5e7eb]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => removePhoto(url)}
              className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
              aria-label={t("delete")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {urls.length < 10 && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className={cn(
              "aspect-square rounded-2xl border-2 border-dashed border-[#d1d5db] flex flex-col items-center justify-center gap-2",
              "hover:border-[#009FD9] hover:bg-[#EBF5FB] transition-all cursor-pointer",
              uploading && "opacity-50 cursor-not-allowed"
            )}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 text-[#009FD9] animate-spin" />
            ) : (
              <>
                <Upload className="h-6 w-6 text-[#9ca3af]" />
                <span className="text-xs text-[#6b7280]">{t("upload")}</span>
              </>
            )}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
