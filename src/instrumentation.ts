// Opt-in request journal for the CI release regression (CI_REQUEST_LOG=1).
// Every HTTP request handled by the Node.js server is logged when it starts and
// when it finishes, so a request that never answers can be identified from the
// job log. Off everywhere else: the Worker runtime and the dev server skip it.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    if (process.env.CI_REQUEST_LOG !== "1") return;
    const { registerRequestJournal } = await import("./instrumentation-node");
    await registerRequestJournal();
  }
}
