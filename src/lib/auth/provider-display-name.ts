/** Provider names may be absent or derived from an Apple relay address. */
export function providerDisplayName(metadata: Record<string, unknown> | undefined, email?: string | null): string {
  const localPart = email?.split("@")[0]?.toLowerCase();
  for (const candidate of [metadata?.full_name, metadata?.name]) {
    if (typeof candidate !== "string") continue;
    const name = candidate.trim();
    if (!name || name.includes("@") || name.toLowerCase() === localPart) continue;
    return name;
  }
  return "";
}
