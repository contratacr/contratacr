import handler from "./.open-next/worker.js";
import { runScheduledPushDrain } from "./src/lib/push/scheduled";
import { runScheduledProDigest } from "./src/lib/pro/scheduled-digest";

// Preserve OpenNext's fetch context and every generated Durable Object export.
export * from "./.open-next/worker.js";
const worker = {
  fetch: handler.fetch,
  async scheduled(event, env, ctx) {
    await runScheduledProDigest(handler.fetch, env, ctx, event.scheduledTime);
    await runScheduledPushDrain(handler.fetch, env, ctx);
  },
};
export default worker;
