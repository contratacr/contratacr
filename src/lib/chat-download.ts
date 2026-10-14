import { Capacitor } from "@capacitor/core";
import { compartirConHojaNativa } from "@/lib/compartir-nativo";

/** Download bytes rather than navigating to a temporary Supabase URL. */
export async function downloadChatAttachment(attachment: { url?: string | null; name: string; type: string }) {
  if (!attachment.url) throw new Error("missing-file");
  const response = await fetch(attachment.url);
  if (!response.ok) throw new Error("file-unavailable");
  const blob = await response.blob();
  const name = attachment.name.replace(/[\\/\u0000-\u001f]/g, "_") || "archivo";
  const file = new File([blob], name, { type: blob.type || attachment.type });

  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("Filesystem") && Capacitor.isPluginAvailable("Share")) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import("@capacitor/filesystem"), import("@capacitor/share"),
    ]);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(blob);
    });
    const path = `chat-downloads/${crypto.randomUUID()}/${name}`;
    const saved = await Filesystem.writeFile({ path, data: base64, directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ files: [saved.uri] });
    } finally {
      // The native share sheet has finished using the temporary file.
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    }
    return;
  }
  if (window.matchMedia("(pointer: coarse)").matches || Capacitor.isNativePlatform()) {
    const result = await compartirConHojaNativa({ files: [file] });
    if (result !== "no-disponible") return;
    // Old store builds cannot download blobs reliably. Never send the user
    // into Safari or expose the signed storage address as a fallback.
    if (Capacitor.isNativePlatform()) throw new Error("native-update-required");
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
