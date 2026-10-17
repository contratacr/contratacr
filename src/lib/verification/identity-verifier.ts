import { isValidId, type IdType } from "@/lib/cedula";
import { readHaciendaCache, writeHaciendaCache } from "./hacienda-cache";

export interface IdentityLookupResult {
  found: boolean;
  fullName: string | null;
  dob: null;
  /** Hacienda does not establish age. Never infer 18+ from a successful match. */
  isAdult: boolean;
  idType?: IdType;
  provider: string;
  unavailable?: boolean;
}
export interface IdentityVerifier {
  readonly name: string;
  lookup(cedula: string, options?: { fresh?: boolean }): Promise<IdentityLookupResult>;
  verify(input: { cedula: string; fullName: string }): Promise<{ matched: boolean; found: boolean; score: number; provider: string }>;
}

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


const TYPES: Record<string, IdType> = { "01": "cedula", "02": "juridica", "03": "dimex", "04": "nite" };
const LENGTHS: Record<IdType, number[]> = { cedula: [9], juridica: [10], dimex: [11, 12], nite: [10] };

/** Public Hacienda API only; no registry scraping, paid providers or tax data storage. */
export class HaciendaIdentityVerifier implements IdentityVerifier {
  readonly name = "hacienda_api";
  private windowStart = 0;
  private calls = 0;
  private blockedUntil = 0;
  async lookup(raw: string, options: { fresh?: boolean } = {}): Promise<IdentityLookupResult> {
    const base: IdentityLookupResult = { found: false, fullName: null, dob: null, isAdult: false, provider: this.name };
    if (!/^[\d\s-]+$/.test(raw)) return base;
    const id = raw.replace(/[\s-]/g, "");
    if (id.length > 12 || !isValidId(id)) return base;
    if (!options.fresh) {
      const cached = await readHaciendaCache(id);
      if (cached) return cached;
    }
    const now = Date.now();
    if (now < this.blockedUntil) return { ...base, unavailable: true };
    if (now - this.windowStart >= 1000) { this.windowStart = now; this.calls = 0; }
    if (++this.calls > 5) return { ...base, unavailable: true };
    try {
      const response = await fetch(`https://api.hacienda.go.cr/fe/ae?identificacion=${id}`, {
        headers: { Accept: "application/json" }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000),
      });
      if (response.status === 429) {
        const seconds = Number(response.headers.get("retry-after"));
        this.blockedUntil = Date.now() + Math.max(60, Math.min(600, Number.isFinite(seconds) ? seconds : 60)) * 1000;
        return { ...base, unavailable: true };
      }
      if (response.status === 404) {
        const missing = await response.json();
        if (missing?.code !== 404) return { ...base, unavailable: true };
        await writeHaciendaCache(id, base); return base;
      }
      if (!response.ok) return { ...base, unavailable: true };
      const data = await response.json();
      if (!data || typeof data.nombre !== "string") return { ...base, unavailable: true };
      const name = data.nombre.replace(/\s+/g, " ").trim();
      if (!name) return { ...base, unavailable: true };
      const idType = TYPES[String(data.tipoIdentificacion).padStart(2, "0")];
      if (!idType || !LENGTHS[idType].includes(id.length) || name.length > 300) return { ...base, unavailable: true };
      const result = { ...base, found: true, fullName: name, idType };
      await writeHaciendaCache(id, result);
      return result;
    } catch {
      // Timeouts, non-JSON and transport errors are NOT "identification not found".
      return { ...base, unavailable: true };
    }
  }
  async verify({ cedula, fullName }: { cedula: string; fullName: string }) {
    const result = await this.lookup(cedula);
    const score = result.found && result.fullName ? nameSimilarity(fullName, result.fullName) : 0;
    return { matched: result.found && score >= NAME_MATCH_THRESHOLD, found: result.found, score, provider: this.name };
  }
}
let verifier: IdentityVerifier | null = null;
export function getIdentityVerifier(): IdentityVerifier {
  return verifier ??= new HaciendaIdentityVerifier();
}
