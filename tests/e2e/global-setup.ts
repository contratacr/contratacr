import { ensureRegressionSeed } from "./seed";

export default async function globalSetup() {
  if (process.env.E2E_FIXTURES_READY !== "1") return;
  await ensureRegressionSeed();
}
