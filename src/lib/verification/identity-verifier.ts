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

export interface IdentityLookupResult {
  /** Cédula exists in the source. */
  found: boolean;
  /** Official full name from the source (properly cased), or null when not found. */
  fullName: string | null;
  /**
   * Date of birth (YYYY-MM-DD). ALWAYS null for the padrón provider: the TSE
   * electoral roll carries no birth date (the always-null `fecha_nacimiento` column
   * was dropped in migration 066). DOB for health bookings is collected manually and
   * stored separately (profiles.date_of_birth / beneficiary_dob, migration 064). The
   * field is kept on the result for the abstraction (a future DOB-bearing provider).
   */
  dob: string | null;
  /**
   * Whether the person is known to be an adult (18+). For the padrón provider
   * this is TRUE when found, because the electoral roll only contains citizens
   * 18 or older — this is our 18+ gate without needing a birth date.
   */
  isAdult: boolean;
  /** Identifier of the provider that produced this result. */
  provider: string;
}

export interface IdentityVerifier {
  readonly name: string;

  // ── Primary flow (robust): look up the official name by cédula ──
  // The professional does NOT type their name for verification; we read it from
  // the source and have them CONFIRM it. This removes name-matching entirely:
  // found → official name (auto-fill + confirm + auto-verify); not found → manual
  // entry + pendiente de revisión. There is NO permissive fallback — a cédula not
  // in the source MUST return found:false (integrity guard against false grants).
  lookup(cedula: string): Promise<IdentityLookupResult>;

  verify(input: IdentityCheckInput): Promise<IdentityCheckResult>;

  // ── Future extension point (DO NOT implement now) ──
  // A stronger, biometric/liveness tier (e.g. Verifik selfie) would implement
  // this and gate the future "Proveedor Autorizado" tier. Optional by design so
  // the current padrón provider doesn't need it.
  verifyBiometric?(input: { cedula: string; selfie: Blob }): Promise<IdentityCheckResult>;
}

/** Title-case a padrón name ("LUCILA PORRAS AGUERO" → "Lucila Porras Aguero"). */
export function titleCaseName(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
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

  async lookup(cedula: string): Promise<IdentityLookupResult> {
    const id = cleanId(cedula);
    if (!id) return { found: false, fullName: null, dob: null, isAdult: false, provider: this.name };
    const admin = createAdminClient();
    // Read via the SECURITY DEFINER RPC (migration 050): it runs as the table
    // owner, so it reads the padrón regardless of service-role table grants, and
    // the padrón stays private (EXECUTE granted to service_role only).
    const { data, error } = await admin.rpc("padron_lookup", { p_cedula: id });
    const row = Array.isArray(data) ? data[0] : data;
    // Not found / error → found:false. NO permissive fallback (integrity guard).
    if (error || !row) return { found: false, fullName: null, dob: null, isAdult: false, provider: this.name };
    const official = titleCaseName(
      [row.nombre, row.papellido, row.sapellido].filter(Boolean).join(" ")
    );
    // The TSE padrón has NO birth date (the always-null `fecha_nacimiento` column was
    // dropped in migration 066) → dob is always null and DOB is collected manually for
    // health bookings (beneficiary_dob / profiles.date_of_birth). Being in the electoral
    // roll already implies 18+ (the roll only contains citizens 18 or older), which is
    // our adult gate without needing a birth date.
    return { found: true, fullName: official || null, dob: null, isAdult: true, provider: this.name };
  }

  async verify({ cedula, fullName }: IdentityCheckInput): Promise<IdentityCheckResult> {
    const id = cleanId(cedula);
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("padron_lookup", { p_cedula: id });
    const row = Array.isArray(data) ? data[0] : data;

    if (error || !row) {
      return { matched: false, found: false, score: 0, provider: this.name };
    }

    const padronName = [row.nombre, row.papellido, row.sapellido].filter(Boolean).join(" ");
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
