import { webDeviceCategory } from "./platform";
import { Capacitor } from "@capacitor/core";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
export function syncAnalyticsPlatform() {
  const native = isNativeAppRuntime();
  const platform = Capacitor.getPlatform();
  const os = native && (platform === "ios" || platform === "android") ? platform : "unknown";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `ccr_platform=${native ? "native" : "web"}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  document.cookie = `ccr_native_os=${os}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  const device = webDeviceCategory(navigator.userAgent, navigator.maxTouchPoints);
  document.cookie = `ccr_web_device=${device}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  return native ? os === "unknown" ? "native_unknown" : os : device === "mobile" ? "web_mobile" : device === "desktop" ? "web_desktop" : "web";
}
