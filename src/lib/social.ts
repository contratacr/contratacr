// Professional social links — the SIMPLE model: the pro enters only a USERNAME,
// we build the URL. We store ONLY the clean username (zero storage beyond it). No
// feeds, OAuth, "connect account", or Meta/Instagram API — just username → link.

export type SocialNetwork = "instagram" | "facebook" | "tiktok";

// `prefix` is shown next to the input so the pro knows to type only their username.
export const SOCIAL_NETWORKS: { key: SocialNetwork; label: string; prefix: string }[] = [
  { key: "instagram", label: "Instagram", prefix: "instagram.com/" },
  { key: "facebook", label: "Facebook", prefix: "facebook.com/" },
  { key: "tiktok", label: "TikTok", prefix: "tiktok.com/@" },
];

// Lenient normalization → a clean username. Accepts the expected bare username, an
// "@handle", or even a full URL pasted by mistake (extracts the username from it).
export function cleanUsername(value: string | null | undefined): string {
  let s = (value ?? "").trim();
  if (!s) return "";
  s = s.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  if (s.includes("/")) {
    // "instagram.com/juanperez" / "tiktok.com/@juanperez" → take the handle segment.
    const parts = s.split("/").filter(Boolean);
    s = parts.length > 1 ? parts[1] : parts[0];
  }
  s = s.replace(/^@+/, "").split(/[?#]/)[0].trim();
  return s;
}

// Plausible username for these networks: letters, numbers, period, underscore,
// hyphen (Facebook vanity URLs allow hyphens), 1–40 chars.
export function isValidUsername(value: string): boolean {
  return /^[A-Za-z0-9._-]{1,40}$/.test(value);
}

// Build the full public URL from a stored username (re-cleans defensively).
export function buildSocialUrl(network: SocialNetwork, username: string | null | undefined): string {
  const u = cleanUsername(username);
  if (!u) return "";
  switch (network) {
    case "instagram": return `https://instagram.com/${u}`;
    case "facebook": return `https://facebook.com/${u}`;
    case "tiktok": return `https://tiktok.com/@${u}`;
  }
}
