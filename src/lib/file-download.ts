import { Capacitor } from "@capacitor/core";
import { compartirConHojaNativa } from "@/lib/compartir-nativo";

/** Web downloads a Blob; app WebViews hand a cached file to the OS instead. */
export async function saveFile(blob: Blob, filename: string, preferShare = false) {
  const name = filename.replace(/[\\/\u0000-\u001f]/g, "_") || "archivo";
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
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
    const id = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("");
    if (Capacitor.getPlatform() === "android" && !preferShare) {
      try {
        // Keep each download: exporting a revised quote must not overwrite an
        // earlier copy. Android exposes this folder in its Documents storage.
        await Filesystem.writeFile({ path: `ContrataCR/${id}/${name}`, data: base64, directory: Directory.Documents, recursive: true });
        return "saved" as const;
      } catch {
        // Older Android releases can require a storage permission the installed
        // build does not declare. Its system sheet is still a usable save path.
      }
    }
    const path = `file-downloads/${id}/${name}`;
    const saved = await Filesystem.writeFile({ path, data: base64, directory: Directory.Cache, recursive: true });
    try {
      await Share.share({ files: [saved.uri] });
    } finally {
      // Android resolves when a recipient is chosen; that app can read the
      // FileProvider URI afterwards. Keep the cached file briefly for it.
      setTimeout(() => { void Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {}); }, 300_000);
    }
    return;
  }
  if (preferShare || Capacitor.isNativePlatform()) {
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
