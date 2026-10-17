import { saveFile } from "@/lib/file-download";

/** Download bytes rather than navigating to a temporary Supabase URL. */
export async function downloadChatAttachment(attachment: { url?: string | null; name: string; type: string }) {
  if (!attachment.url) throw new Error("missing-file");
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error("file-unavailable");
  const blob = await response.blob();
  await saveFile(blob.type ? blob : new Blob([blob], { type: attachment.type }), attachment.name, window.matchMedia("(pointer: coarse)").matches);
}
