"use client";

export async function deleteOwnedMediaUrl(url: string | null | undefined) {
  if (!url || url.startsWith("blob:")) return false;
  const response = await fetch("/api/upload/media", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok) throw new Error("Media cleanup failed");
  const result = await response.json().catch(() => null) as { deleted?: boolean } | null;
  return result?.deleted === true;
}

export async function deleteOwnedMediaUrls(urls: Iterable<string>) {
  await Promise.allSettled([...new Set(urls)].map((url) => deleteOwnedMediaUrl(url)));
}
