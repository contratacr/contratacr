import { pathToFileURL } from "node:url";

const SUPABASE_REF_PATTERN = /^[a-z0-9]{20}$/;
const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const POOLER_HOST_PATTERN = /^[a-z0-9-]+\.pooler\.supabase\.com$/;

function invalid(message) {
  throw new Error(message);
}

function parseUrl(rawValue) {
  try {
    return new URL(rawValue);
  } catch {
    invalid("The configured Supabase target is not a valid URL.");
  }
}

function decodedUsername(url) {
  try {
    return decodeURIComponent(url.username);
  } catch {
    invalid("The configured Supabase database username is invalid.");
  }
}

export function validateSupabaseTarget(kind, rawValue, expectedProjectRef) {
  if (!SUPABASE_REF_PATTERN.test(expectedProjectRef)) {
    invalid("The expected Supabase project reference is invalid.");
  }
  if (!rawValue?.trim()) {
    invalid("The required Supabase target is missing.");
  }

  const url = parseUrl(rawValue.trim());
  const hostname = url.hostname.toLowerCase();

  if (kind === "api") {
    const expectedHost = `${expectedProjectRef}.supabase.co`;
    const hasRootPath = url.pathname === "" || url.pathname === "/";
    if (
      url.protocol !== "https:" ||
      hostname !== expectedHost ||
      url.port !== "" ||
      url.username !== "" ||
      url.password !== "" ||
      !hasRootPath ||
      url.search !== "" ||
      url.hash !== ""
    ) {
      invalid("The Supabase API URL is not the expected isolated project.");
    }
    return;
  }

  if (kind !== "db") {
    invalid("Unknown Supabase target kind.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    invalid("The Supabase database target must use PostgreSQL.");
  }

  const port = url.port || "5432";
  if (port === "6543") {
    invalid("Transaction-pooler port 6543 is not allowed.");
  }
  if (port !== "5432") {
    invalid("The Supabase database target must use direct/session-mode port 5432.");
  }
  if (url.pathname !== "/postgres") {
    invalid("The Supabase database target must use the postgres database.");
  }

  const username = decodedUsername(url);
  const isDirect =
    hostname === `db.${expectedProjectRef}.supabase.co` && username === "postgres";
  const isSessionPooler =
    POOLER_HOST_PATTERN.test(hostname) && username === `postgres.${expectedProjectRef}`;

  if (!isDirect && !isSessionPooler) {
    invalid("The Supabase database URL is not the expected project endpoint.");
  }
}

function main() {
  const [kind, envName, expectedProjectRef] = process.argv.slice(2);
  if (!ENV_NAME_PATTERN.test(envName ?? "")) {
    invalid("A valid environment variable name is required.");
  }

  validateSupabaseTarget(kind, process.env[envName], expectedProjectRef);
  process.stdout.write(`Validated ${kind} target for the expected Supabase project.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Supabase target validation failed.";
    console.error(`::error::${message}`);
    process.exitCode = 1;
  }
}
