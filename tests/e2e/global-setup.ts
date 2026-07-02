import { ensureRegressionSeed } from "./seed";

export default async function globalSetup() {
  if (process.env.E2E_SEED !== "1") return;
  await ensureRegressionSeed();
}
