import { readFile } from "node:fs/promises";

const expected = {
  appId: "com.contratacr.app",
  appName: "ContrataCR",
  serverOrigin: "https://contratacr-mobile-test.vercel.app",
  serverPath: "/es",
  firebaseProjectId: "contratacr-95d6f",
};

const failures = [];

function requireMatch(label, value, pattern) {
  if (!pattern.test(value)) failures.push(`${label} does not match ${pattern}`);
}

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

const [
  capacitor,
  manifest,
  androidGradle,
  googleServicesRaw,
  infoPlist,
  entitlements,
  projectFile,
  navbar,
  directChatLauncher,
  localeLayout,
] = await Promise.all([
  text("capacitor.config.ts"),
  text("android/app/src/main/AndroidManifest.xml"),
  text("android/app/build.gradle"),
  text("android/app/google-services.json"),
  text("ios/App/App/Info.plist"),
  text("ios/App/App/App.entitlements"),
  text("ios/App/App.xcodeproj/project.pbxproj"),
  text("src/components/landing/landing-navbar.tsx"),
  text("src/components/professionals/direct-chat-launcher.tsx"),
  text("src/app/[locale]/layout.tsx"),
]);

requireMatch("Capacitor app id", capacitor, new RegExp(`appId:\\s*"${expected.appId.replaceAll(".", "\\.")}"`));
requireMatch("Capacitor app name", capacitor, new RegExp(`appName:\\s*"${expected.appName}"`));
requireMatch(
  "Capacitor mobile-test URL",
  capacitor,
  new RegExp(`url:\\s*"${expected.serverOrigin.replaceAll(".", "\\.")}${expected.serverPath}"`),
);
requireMatch("Capacitor navigation allowlist", capacitor, /"contratacr-mobile-test\.vercel\.app"/);
requireMatch("Android application id", androidGradle, /applicationId "com\.contratacr\.app"/);
requireMatch("Android namespace", androidGradle, /namespace = "com\.contratacr\.app"/);
requireMatch("Android notification permission", manifest, /android\.permission\.POST_NOTIFICATIONS/);
requireMatch("Android camera permission", manifest, /android\.permission\.CAMERA/);
requireMatch(
  "Android optional camera feature",
  manifest,
  /uses-feature android:name="android\.hardware\.camera" android:required="false"/,
);
requireMatch("Android single-task launch mode", manifest, /android:launchMode="singleTask"/);
requireMatch("iOS camera disclosure", infoPlist, /<key>NSCameraUsageDescription<\/key>/);
requireMatch("iOS photo disclosure", infoPlist, /<key>NSPhotoLibraryUsageDescription<\/key>/);
requireMatch("iOS encryption declaration", infoPlist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
requireMatch("iOS push entitlement", entitlements, /<key>aps-environment<\/key>\s*<string>production<\/string>/);
requireMatch("iOS bundle id", projectFile, /PRODUCT_BUNDLE_IDENTIFIER = com\.contratacr\.app;/);
requireMatch(
  "Native bottom navigation order",
  navbar,
  /href="\/buscar"[\s\S]*href="\/ofertas"[\s\S]*contratacr:open-ai[\s\S]*href="\/empleos"[\s\S]*href=\{nativePanelHref\}/,
);
requireMatch("Native messages unread badge", navbar, /HeaderMessagesLink unreadCount=\{nativeMessageUnread\}/);
requireMatch("Native WhatsApp replacement", directChatLauncher, /if \(nativeApp\)[\s\S]*<MessageLauncher/);
requireMatch("Global assistant", localeLayout, /<AiConcierge\s*\/>/);

const googleServices = JSON.parse(googleServicesRaw);
if (googleServices.project_info?.project_id !== expected.firebaseProjectId) {
  failures.push(`Firebase project id is ${googleServices.project_info?.project_id ?? "missing"}`);
}
const firebasePackages = googleServices.client
  ?.map((entry) => entry.client_info?.android_client_info?.package_name)
  .filter(Boolean) ?? [];
if (!firebasePackages.includes(expected.appId)) {
  failures.push(`Firebase does not contain Android package ${expected.appId}`);
}

if (process.argv.includes("--remote")) {
  for (const path of ["/es", "/es/buscar", "/es/login", "/es/privacidad"]) {
    const response = await fetch(`${expected.serverOrigin}${path}`, { redirect: "follow" });
    const body = await response.text();
    if (!response.ok) failures.push(`${path} returned HTTP ${response.status}`);
    if (/log in to vercel/i.test(body)) failures.push(`${path} is protected by Vercel authentication`);
    if (!/ContrataCR/i.test(body)) failures.push(`${path} did not return the ContrataCR application`);
  }
}

if (failures.length) {
  console.error("Mobile native contract validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Mobile native contracts are valid for ${expected.appId} at ${expected.serverOrigin}.`);
