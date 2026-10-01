import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function analyzePlaywrightReport(report) {
  const cases = [];

  function collect(suites = [], parents = []) {
    for (const suite of suites) {
      const nextParents = [...parents, suite.title].filter(Boolean);
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          cases.push({
            name: [...nextParents, spec.title, test.projectName].filter(Boolean).join(" › "),
            expectedStatus: test.expectedStatus,
            results: test.results ?? [],
            // test.skip(condición, "motivo") deja una anotación «skip» con su
            // descripción, en la prueba o en su resultado según la versión.
            skipReason: [...(test.annotations ?? []), ...(test.results ?? []).flatMap((r) => r.annotations ?? [])]
              .find((a) => a.type === "skip" && a.description?.trim())?.description?.trim() ?? null,
          });
        }
      }
      collect(suite.suites ?? [], nextParents);
    }
  }

  collect(report.suites ?? []);
  // SALTO DECLARADO ≠ SALTO INESPERADO. Una prueba que solo aplica al
  // teléfono se salta en computadora, y las de citas mientras estén apagadas:
  // son saltos con motivo escrito, decididos. Lo que no puede pasar es un salto
  // sin explicación (un test.skip() suelto, una prueba que no llegó a correr),
  // y eso sigue tumbando la certificación.
  const skipped = [];
  const declaredSkips = [];
  const flaky = [];
  const failed = [];

  for (const item of cases) {
    const statuses = item.results.map((result) => result.status);
    const finalStatus = statuses.at(-1);
    if (item.expectedStatus === "skipped" || finalStatus === "skipped" || statuses.length === 0) {
      if (statuses.length > 0 && item.skipReason) declaredSkips.push(`${item.name} — ${item.skipReason}`);
      else skipped.push(item.name);
      continue;
    }
    if (finalStatus !== "passed") {
      failed.push(`${item.name} (${finalStatus ?? "missing result"})`);
      continue;
    }
    if (statuses.slice(0, -1).some((status) => status !== "passed")) flaky.push(item.name);
  }

  return { total: cases.length, failed, flaky, skipped, declaredSkips };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const reportPath = resolve(process.cwd(), process.env.PLAYWRIGHT_JSON_REPORT || "test-results/results.json");
  if (!existsSync(reportPath)) throw new Error(`Playwright JSON report is missing: ${reportPath}`);
  const result = analyzePlaywrightReport(JSON.parse(readFileSync(reportPath, "utf8")));

  if (result.total === 0) throw new Error("Playwright JSON report contains no executed test cases.");
  console.log(JSON.stringify({
    total: result.total,
    failed: result.failed.length,
    flaky: result.flaky.length,
    skipped: result.skipped.length,
    declaredSkips: result.declaredSkips.length,
  }, null, 2));
  if (result.declaredSkips.length) console.log(`Saltos declarados (con motivo):\n${result.declaredSkips.join("\n")}`);

  const problems = [
    ...result.failed.map((name) => `failed: ${name}`),
    ...result.flaky.map((name) => `flaky: ${name}`),
    ...result.skipped.map((name) => `skipped: ${name}`),
  ];

  if (problems.length) {
    throw new Error(`Regression requires every discovered case to pass on its first attempt:\n${problems.join("\n")}`);
  }
}
