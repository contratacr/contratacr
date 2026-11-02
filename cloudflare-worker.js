import handler from "./.open-next/worker.js";
import { runScheduledPushDrain } from "./src/lib/push/scheduled";

// Preserve OpenNext's fetch context and every generated Durable Object export.
export * from "./.open-next/worker.js";
const worker = {
  fetch: handler.fetch,
  async scheduled(_event, env, ctx) {
    await runScheduledPushDrain(handler.fetch, env, ctx);
  },
};
export default worker;
