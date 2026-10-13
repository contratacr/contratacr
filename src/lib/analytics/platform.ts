export type AnalyticsRuntime = "web" | "android" | "ios" | "native_unknown";
export function analyticsPlatform(read: (name: string) => string | undefined | null) {
  const native = read("ccr_platform") === "native";
  const os = read("ccr_native_os");
  const runtime: AnalyticsRuntime = native ? os === "android" || os === "ios" ? os : "native_unknown" : "web";
  return { platform: native ? "native" : "web", runtime };
}
export function requestAnalyticsPlatform(req: Request) {
  const jar = new Map((req.headers.get("cookie") ?? "").split(";").map(value => {
    const [key, ...rest] = value.trim().split("=");
    return [key, rest.join("=")];
  }));
  return analyticsPlatform(name => jar.get(name));
}
