import { createAdminClient } from "@/lib/supabase/admin";
import { cleanId } from "@/lib/cedula";

// ── IdentityVerifier abstraction ────────────────────────────────────────────
// ContrataCR's verification flow calls this interface only. The underlying
// provider is swappable WITHOUT touching callers: self-hosted padrón today,
// ApifyCR / Verifik later by swapping `getIdentityVerifier()`. INTERNAL USE
// ONLY — there is no public endpoint, no third-party auth, no external rate
// limiting; the app calls it server-side.

export interface IdentityCheckInput {
  cedula: string;   // clean digits
  fullName: string; // entered name to match
}

export interface IdentityCheckResult {
  /** Cédula exists in the source AND the name matches above threshold. */
  matched: boolean;
  /** Cédula exists in the source (regardless of name match). */
  found: boolean;
  /** Name similarity 0..1 (0 when not found). */
  score: number;
  /** Identifier of the provider that produced this result. */
  provider: string;
}

export interface IdentityVerifier {
  readonly name: string;
  verify(input: IdentityCheckInput): Promise<IdentityCheckResult>;

  // ── Future extension point (DO NOT implement now) ──
  // A stronger, biometric/liveness tier (e.g. Verifik selfie) would implement
  // this and gate the future "Proveedor Autorizado" tier. Optional by design so
  // the current padrón provider doesn't need it.
  verifyBiometric?(input: { cedula: string; selfie: Blob }): Promise<IdentityCheckResult>;
}

// ── Name normalization + similarity ─────────────────────────────────────────
// Tuned to minimize FALSE NEGATIVES — a legitimate user must never be rejected
// over an accent or formatting. We compare normalized token SETS (order- and
// accent-insensitive), which tolerates apellido order and partial names.

export function normalizeName(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")     // drop punctuation
    .replace(/\s+/g, " ")
    .trim();
}

const STOPWORDS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y"]);

function tokens(s: string): string[] {
  return normalizeName(s).split(" ").filter((t) => t && !STOPWORDS.has(t));
}

/**
 * Similarity as the share of the SHORTER name's tokens that appear in the other
 * (subset-tolerant: "Juan Perez" vs "Juan Carlos Perez Gonzalez" scores high).
 * Returns 0..1.
 */
export function nameSimilarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const setB = new Set(tb);
  const setA = new Set(ta);
  const overlap = ta.filter((t) => setB.has(t)).length;
  const minLen = Math.min(setA.size, setB.size);
  return overlap / minLen;
}

// Names matching at or above this share of tokens are accepted.
export const NAME_MATCH_THRESHOLD = 0.6;

// ── Self-hosted padrón provider ─────────────────────────────────────────────
export class SelfHostedPadronVerifier implements IdentityVerifier {
  readonly name = "self_hosted_padron";

  async verify({ cedula, fullName }: IdentityCheckInput): Promise<IdentityCheckResult> {
    const id = cleanId(cedula);
    const admin = createAdminClient();

    const { data, error } = await admin
      .from("padron")
      .select("nombre, papellido, sapellido")
      .eq("cedula", id)
      .maybeSingle();

    if (error || !data) {
      return { matched: false, found: false, score: 0, provider: this.name };
    }

    const padronName = [data.nombre, data.papellido, data.sapellido].filter(Boolean).join(" ");
    const score = nameSimilarity(fullName, padronName);
    return { matched: score >= NAME_MATCH_THRESHOLD, found: true, score, provider: this.name };
  }
}

// ── Factory — swap the provider here, callers never change ───────────────────
let _verifier: IdentityVerifier | null = null;
export function getIdentityVerifier(): IdentityVerifier {
  if (!_verifier) _verifier = new SelfHostedPadronVerifier();
  return _verifier;
}
