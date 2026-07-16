"use client";

const SAFE_UPLOAD_BYTES = 3.8 * 1024 * 1024;

export type ImageUploadPreparationErrorCode = "too_large" | "unsupported";

export class ImageUploadPreparationError extends Error {
  code: ImageUploadPreparationErrorCode;

  constructor(code: ImageUploadPreparationErrorCode) {
    super(code);
    this.code = code;
  }
}

export function getImageUploadPreparationErrorCode(error: unknown): ImageUploadPreparationErrorCode | null {
  return error instanceof ImageUploadPreparationError ? error.code : null;
}

type PrepareImageOptions = {
  maxDimension?: number;
  targetBytes?: number;
};

type UploadPhotoResult = {
  ok: boolean;
  status: number;
  data: { url?: string; error?: string };
};

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
};

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement below. Some browsers do not decode HEIC here.
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({
        source: image,
        width: image.naturalWidth || image.width,
        height: image.naturalHeight || image.height,
        cleanup: () => URL.revokeObjectURL(url),
      });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageUploadPreparationError("unsupported"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new ImageUploadPreparationError("unsupported"));
      },
      "image/jpeg",
      quality
    );
  });
}

function resizedCanvas(decoded: DecodedImage, maxDimension: number) {
  const longest = Math.max(decoded.width, decoded.height);
  const scale = Math.min(1, maxDimension / longest);
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageUploadPreparationError("unsupported");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(decoded.source, 0, 0, width, height);
  return canvas;
}

function jpegName(name: string) {
  const base = name.replace(/\.[^.]+$/, "").trim() || "foto";
  return `${base}.jpg`;
}

/**
 * Vercel Functions reject request bodies over 4.5 MB before our API route can
 * validate them. Compress large browser-selected photos first so mobile camera
 * images do not fail with a generic network/upload error in production.
 */
export async function prepareImageForUpload(file: File, options: PrepareImageOptions = {}) {
  const targetBytes = options.targetBytes ?? SAFE_UPLOAD_BYTES;
  if (file.size <= targetBytes) return file;

  const normalizedType = file.type.toLowerCase();
  if (normalizedType === "image/gif") {
    throw new ImageUploadPreparationError("too_large");
  }

  let decoded: DecodedImage | null = null;
  try {
    decoded = await decodeImage(file);
    const maxDimension = options.maxDimension ?? 1600;
    const attempts = [
      { dimension: maxDimension, quality: 0.86 },
      { dimension: maxDimension, quality: 0.78 },
      { dimension: Math.min(maxDimension, 1400), quality: 0.76 },
      { dimension: Math.min(maxDimension, 1200), quality: 0.74 },
      { dimension: Math.min(maxDimension, 1000), quality: 0.72 },
    ];

    for (const attempt of attempts) {
      const canvas = resizedCanvas(decoded, attempt.dimension);
      const blob = await canvasToBlob(canvas, attempt.quality);
      if (blob.size <= targetBytes) {
        return new File([blob], jpegName(file.name), {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    }
  } catch (error) {
    if (file.size <= targetBytes) return file;
    if (error instanceof ImageUploadPreparationError) throw error;
    throw new ImageUploadPreparationError("unsupported");
  } finally {
    decoded?.cleanup();
  }

  throw new ImageUploadPreparationError("too_large");
}

export async function uploadPhotoFormDataWithRetry(formData: FormData, attempts = 2): Promise<UploadPhotoResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetch("/api/upload/photo", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return { ok: res.ok, status: res.status, data };
      }
      lastError = new Error(data?.error || `upload failed with ${res.status}`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts - 1) await wait(650 * (attempt + 1));
  }

  const message = lastError instanceof Error && lastError.message ? lastError.message : "upload failed";
  return { ok: false, status: 0, data: { error: message } };
}
