import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, test } from "playwright/test";

type OwnershipRule = {
  match: RegExp;
  owner: string;
  parked?: boolean;
};

const appRoot = resolve(process.cwd(), "src/app");
const e2eRoot = resolve(process.cwd(), "tests/e2e");

function filesNamed(directory: string, fileName: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesNamed(path, fileName) : entry.name === fileName ? [path] : [];
  });
}

function appRoute(file: string, terminal: "page.tsx" | "route.ts") {
  const path = relative(appRoot, file).replaceAll("\\", "/");
  const withoutTerminal = path === terminal ? "" : path.slice(0, -(terminal.length + 1));
  return `/${withoutTerminal}`;
}

// GEMELA de la lista de `scripts/ci/verify-app-surface-ownership.mjs` (el CI la
// corre en cada push). La prueba de más abajo compara las dos y falla si se
// separan: antes se editaba una sola y la otra se enteraba semanas después.
const pageRules: OwnershipRule[] = [
  { match: /^\/\[locale\]\/admin(?:\/|$)/, owner: "admin-smoke.spec.ts" },
  { match: /^\/\[locale\]\/dashboard(?:\/|$)/, owner: "dashboard-surfaces.spec.ts" },
  { match: /^\/\[locale\]\/(?:empleos|ofertas)\/(?:publicar|\[id\]\/editar|mis-empleos|mis-ofertas)$/, owner: "marketplace-editors.spec.ts" },
  { match: /^\/\[locale\]\/(?:empleos|ofertas)(?:\/|$)/, owner: "marketplace-lifecycle.spec.ts" },
  { match: /^\/\[locale\]\/profesionales(?:\/|$)/, owner: "professional-profile.spec.ts" },
  { match: /^\/\[locale\]\/notificaciones$/, owner: "notifications-guides-regression.spec.ts" },
  { match: /^\/\[locale\]\/mensajes$/, owner: "direct-chat.spec.ts", parked: true },
  { match: /^\/\[locale\]\/(?:registro|reset-password|onboarding|completar-perfil)$/, owner: "auth-screens.spec.ts" },
  { match: /^\/\[locale\]\/(?:login|registro|olvide-contrasena|reset-password|onboarding|completar-perfil)(?:\/|$)/, owner: "auth-support.spec.ts" },
  { match: /^\/\[locale\]\/eliminar-cuenta$/, owner: "account-lifecycle.spec.ts" },
  { match: /^\/\[locale\](?:\/|$)/, owner: "public-smoke.spec.ts" },
  { match: /^\/$/, owner: "public-smoke.spec.ts" },
];

const handlerRules: OwnershipRule[] = [
  { match: /^\/auth\/callback$/, owner: "product-contract.spec.ts" },
  { match: /^\/api\/admin(?:\/|$)/, owner: "admin-smoke.spec.ts" },
  { match: /^\/api\/ai-assistant(?:\/|$)/, owner: "ai-assistant.spec.ts" },
  { match: /^\/api\/account(?:\/|$)/, owner: "account-lifecycle.spec.ts" },
  { match: /^\/api\/auth(?:\/|$)/, owner: "auth-support.spec.ts" },
  { match: /^\/api\/(?:bookings|projects|proposals|reviews|support|quotes)(?:\/|$)/, owner: "seeded-regression.spec.ts" },
  { match: /^\/api\/(?:jobs|offers)(?:\/|$)/, owner: "marketplace-lifecycle.spec.ts" },
  { match: /^\/api\/direct-chat(?:\/|$)/, owner: "direct-chat.spec.ts", parked: true },
  { match: /^\/api\/(?:push|internal\/push)(?:\/|$)/, owner: "push-outbox-contract.spec.ts" },
  { match: /^\/api\/payments(?:\/|$)/, owner: "product-contract.spec.ts" },
  { match: /^\/api\/(?:search|categories|insurers)(?:\/|$)/, owner: "api-smoke.spec.ts" },
  { match: /^\/api\/contact(?:\/|$)/, owner: "whatsapp-review-followup.spec.ts" },
  { match: /^\/api\/(?:upload|media)(?:\/|$)/, owner: "extended-lifecycle.spec.ts" },
  { match: /^\/api\/(?:register|cedula|cedula-available|add-cedula|verify-identity)(?:\/|$)/, owner: "product-contract.spec.ts" },
  { match: /^\/api\/(?:appeals|report|report-client|report-professional|portfolio-like|professional-followers|client\/connections)(?:\/|$)/, owner: "interaction-surfaces.spec.ts" },
  { match: /^\/api\/(?:public-availability|check-availability|professionals|buscar)(?:\/|$)/, owner: "search-results.spec.ts" },
  { match: /^\/api\/internal\/recordatorios$/, owner: "reminders-contract.spec.ts" },
  { match: /^\/api\/(?:analytics|attribution|translate|client-error|opportunities)(?:\/|$)/, owner: "product-contract.spec.ts" },
  { match: /^\/api\/health$/, owner: "health.spec.ts" },
];

function ownership(route: string, rules: OwnershipRule[]) {
  const rule = rules.find((candidate) => candidate.match.test(route));
  expect(rule, `${route} has no regression owner`).toBeTruthy();
  expect(existsSync(resolve(e2eRoot, rule!.owner)), `${route} points to missing ${rule!.owner}`).toBe(true);
  return rule!;
}

test.describe("application surface ownership", () => {
  test("every page route is owned by an active or explicitly parked regression surface", () => {
    const routes = filesNamed(appRoot, "page.tsx").map((file) => appRoute(file, "page.tsx")).sort();
    expect(routes.length).toBeGreaterThan(0);
    const parked = routes.filter((route) => ownership(route, pageRules).parked);
    expect(parked).toEqual(["/[locale]/mensajes"]);
  });

  test("every route handler has a regression owner", () => {
    const routes = filesNamed(appRoot, "route.ts").map((file) => appRoute(file, "route.ts")).sort();
    expect(routes.length).toBeGreaterThan(0);
    const parked = routes.filter((route) => ownership(route, handlerRules).parked);
    expect(parked).toEqual(["/api/direct-chat", "/api/direct-chat/attachments"]);
  });

  test("the default web suite only excludes the parked chat and the app-only shell", () => {
    const config = resolve(process.cwd(), "playwright.config.ts");
    expect(existsSync(config)).toBe(true);
    const source = readFileSync(config, "utf8");
    // Dos exclusiones y no más: el chat aparcado y el armazón nativo, que no es
    // web —vive en `playwright.mobile.config.ts` y ahí sí se corre—. Cualquier
    // otra suite que alguien saque de la corrida web tiene que doler aquí.
    expect(source).toMatch(/testIgnore:\s*\["\*\*\/direct-chat\.spec\.ts", "\*\*\/mobile-native-shell\.spec\.ts"\]/);
    expect(source.match(/\.spec\.ts/g)).toHaveLength(2);
    const mobileConfig = readFileSync(resolve(process.cwd(), "playwright.mobile.config.ts"), "utf8");
    for (const suite of ["direct-chat.spec.ts", "mobile-native-shell.spec.ts"]) {
      expect(mobileConfig, `${suite} must still run somewhere`).toContain(suite);
    }
  });

  test("the CI ownership script and this contract share the same rules", () => {
    const literales = (source: string, lista: string) => {
      const inicio = source.indexOf(lista);
      const bloque = source.slice(inicio, source.indexOf("];", inicio));
      return [...bloque.matchAll(/\/\^[^\n]*?\/(?=[,\s])/g)].map((match) => match[0]).sort();
    };
    const contrato = readFileSync(resolve(process.cwd(), "tests/e2e/app-surface-ownership.spec.ts"), "utf8");
    const script = readFileSync(resolve(process.cwd(), "scripts/ci/verify-app-surface-ownership.mjs"), "utf8");
    for (const lista of ["const pageRules", "const handlerRules"]) {
      expect(literales(contrato, lista), `${lista} drifted between the contract and the CI script`).toEqual(literales(script, lista));
    }
  });

  test("GitHub result verification rejects retries and skips", () => {
    const directory = mkdtempSync(resolve(tmpdir(), "contratacr-playwright-report-"));
    const reportPath = resolve(directory, "results.json");
    try {
      writeFileSync(reportPath, JSON.stringify({
        suites: [{
          title: "contracts",
          specs: [{
            title: "matrix",
            tests: [
              { projectName: "desktop", expectedStatus: "passed", results: [{ status: "passed" }] },
              { projectName: "mobile", expectedStatus: "passed", results: [{ status: "failed" }, { status: "passed" }] },
              { projectName: "parked", expectedStatus: "skipped", results: [{ status: "skipped" }] },
            ],
          }],
        }],
      }));
      const result = spawnSync(process.execPath, [resolve(process.cwd(), "scripts/ci/verify-playwright-results.mjs")], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, PLAYWRIGHT_JSON_REPORT: reportPath },
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("flaky:");
      expect(result.stderr).toContain("skipped:");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
