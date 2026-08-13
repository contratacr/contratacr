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
          });
        }
      }
      collect(suite.suites ?? [], nextParents);
    }
  }

  collect(report.suites ?? []);
  const skipped = [];
  const flaky = [];
  const failed = [];

  for (const item of cases) {
    const statuses = item.results.map((result) => result.status);
    const finalStatus = statuses.at(-1);
    if (item.expectedStatus === "skipped" || finalStatus === "skipped" || statuses.length === 0) {
      skipped.push(item.name);
      continue;
    }
    if (finalStatus !== "passed") {
      failed.push(`${item.name} (${finalStatus ?? "missing result"})`);
      continue;
    }
    if (statuses.slice(0, -1).some((status) => status !== "passed")) flaky.push(item.name);
  }

  return { total: cases.length, failed, flaky, skipped };
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
  }, null, 2));

  const problems = [
    ...result.failed.map((name) => `failed: ${name}`),
    ...result.flaky.map((name) => `flaky: ${name}`),
    ...result.skipped.map((name) => `skipped: ${name}`),
  ];

  if (problems.length) {
    throw new Error(`Regression requires every discovered case to pass on its first attempt:\n${problems.join("\n")}`);
  }
}
