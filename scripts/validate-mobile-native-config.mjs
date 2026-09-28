import { readFile } from "node:fs/promises";

const expected = {
  appId: "com.contratacr.app",
  appName: "ContrataCR",
  // The store builds load production; set MOBILE_SERVER_ORIGIN to check a build
  // pointed somewhere else (e.g. https://test.contratacr.com while testing).
  serverOrigin: process.env.MOBILE_SERVER_ORIGIN || "https://contratacr.com",
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
  appDelegate,
  packageSwift,
  packageJson,
  mobileWebIndex,
  pushTokenManager,
  pushRegisterRoute,
  pushSender,
  navbar,
  bottomNav,
  directChatLauncher,
  aiConcierge,
  aiAssistantRoute,
  localeLayout,
  globalCss,
  defaultPlaywright,
  mobilePlaywright,
  mobileShellSpec,
  mobileWorkflow,
] = await Promise.all([
  text("capacitor.config.ts"),
  text("android/app/src/main/AndroidManifest.xml"),
  text("android/app/build.gradle"),
  text("android/app/google-services.json"),
  text("ios/App/App/Info.plist"),
  text("ios/App/App/App.entitlements"),
  text("ios/App/App.xcodeproj/project.pbxproj"),
  text("ios/App/App/AppDelegate.swift"),
  text("ios/App/CapApp-SPM/Package.swift"),
  text("package.json"),
  text("mobile-web/index.html"),
  text("src/components/push/push-token-manager.tsx"),
  text("src/app/api/push/register/route.ts"),
  text("src/lib/push/send.ts"),
  text("src/components/landing/landing-navbar.tsx"),
  // La barra de abajo vive en su propio componente desde que se separó del
  // navbar; el contrato la seguía buscando en el archivo viejo.
  text("src/components/mobile/native-bottom-nav.tsx"),
  text("src/components/professionals/direct-chat-launcher.tsx"),
  text("src/components/landing/ai-concierge.tsx"),
  text("src/app/api/ai-assistant/route.ts"),
  text("src/app/[locale]/layout.tsx"),
  text("src/app/globals.css"),
  text("playwright.config.ts"),
  text("playwright.mobile.config.ts"),
  text("tests/e2e/mobile-native-shell.spec.ts"),
  text(".github/workflows/mobile-native-regression.yml"),
]);

requireMatch("Capacitor app id", capacitor, new RegExp(`appId:\\s*"${expected.appId.replaceAll(".", "\\.")}"`));
requireMatch("Capacitor app name", capacitor, new RegExp(`appName:\\s*"${expected.appName}"`));
requireMatch("Capacitor web directory", capacitor, /webDir:\s*"mobile-web"/);
requireMatch(
  "Capacitor mobile-test URL",
  capacitor,
  new RegExp(`url:\\s*"${expected.serverOrigin.replaceAll(".", "\\.")}${expected.serverPath}"`),
);
requireMatch("Capacitor navigation allowlist", capacitor, /"\*\.contratacr\.com"/);
requireMatch(
  "Foreground push presentation",
  capacitor,
  /PushNotifications:\s*\{[\s\S]*presentationOptions:\s*\["badge",\s*"sound",\s*"banner",\s*"list"\]/,
);
requireMatch("Android Capacitor dependency", packageJson, /"@capacitor\/android":\s*"8\.4\.2"/);
requireMatch("iOS Capacitor dependency", packageJson, /"@capacitor\/ios":\s*"8\.4\.2"/);
requireMatch("Packaged mobile web entry", mobileWebIndex, /<!doctype html>[\s\S]*<meta charset="utf-8"/i);
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
requireMatch("iOS registration callback", appDelegate, /didRegisterForRemoteNotificationsWithDeviceToken[\s\S]*capacitorDidRegisterForRemoteNotifications/);
requireMatch("iOS registration error callback", appDelegate, /didFailToRegisterForRemoteNotificationsWithError[\s\S]*capacitorDidFailToRegisterForRemoteNotifications/);
if (/path:\s*"[^"]*\\/.test(packageSwift)) {
  failures.push("SwiftPM dependency paths contain Windows backslashes");
}
requireMatch("Sign-out-safe push registration", pushTokenManager, /registrationAbortRef\.current\?\.abort\(\)[\s\S]*registrationTaskRef\.current\?\.catch/);
requireMatch("Push registration retries", pushTokenManager, /TOKEN_POST_RETRY_DELAYS_MS = \[0, 750, 2_500\]/);
requireMatch("iOS APNs upload guard", pushTokenManager, /if \(platform === "ios"\) return/);
requireMatch("iOS APNs API rejection", pushRegisterRoute, /platform === "ios" && \/\^\[a-f0-9\]\{64\}\$\/i\.test\(token\)[\s\S]*iOS push no esta configurado/);
requireMatch("FCM sender transport filter", pushSender, /\.eq\("transport", "fcm"\)/);
requireMatch("Push text encoding repair", pushSender, /repairVisibleText\(value\)/);
// SIN BARRA EN LAS PANTALLAS DE DETALLE. La regla vive en src/lib/rutas-sin-barra.ts
// y, en literal, en el script de arranque de layout.tsx (corre antes de
// hidratar). Si una cambia y la otra no, la barra aparece un cuadro y se va.
const rutasSinBarra = await text("src/lib/rutas-sin-barra.ts");
const layoutRaiz = await text("src/app/layout.tsx");
requireMatch("Bottom nav uses the shared no-bar rule", bottomNav, /sinBarraDeAbajo\(pathname\)/);
const detalleEnHelper = /RUTA_DE_DETALLE = \/(.+)\/;/.exec(rutasSinBarra)?.[1];
if (!detalleEnHelper) failures.push("rutas-sin-barra.ts: RUTA_DE_DETALLE not found");
else if (!layoutRaiz.includes(detalleEnHelper.replace(/\\/g, "\\\\"))) failures.push("layout.tsx boot script does not carry the same RUTA_DE_DETALLE as rutas-sin-barra.ts");
// La barra es la MISMA para todos: cinco lugares fijos, sin ramas por cuenta.
// El Asistente y Cotizaciones viven en el menú lateral.
requireMatch(
  "Native bottom navigation order",
  bottomNav,
  /href="\/buscar"[\s\S]*href="\/promociones"[\s\S]*href="\/proyectos"[\s\S]*href="\/empleos"[\s\S]*href=\{nativePanelHref\}/,
);
// Si alguien devuelve el Asistente o Cotizaciones a la barra, esto lo dice
// antes de que llegue a la tienda.
if (/contratacr:open-ai/.test(bottomNav)) {
  failures.push("Native bottom navigation still opens the assistant; it belongs in the drawer");
}
if (/tab=quotes/.test(bottomNav)) {
  failures.push("Native bottom navigation still links to quotes; they belong in the drawer");
}
requireMatch("Native messages unread badge", navbar, /HeaderMessagesLink unreadCount=\{nativeMessageUnread\}/);
requireMatch("Native messages badge counter", navbar, /unreadCount > 0[\s\S]*unreadCount > 9 \? "9\+" : unreadCount/);
requireMatch("Native WhatsApp replacement", directChatLauncher, /if \(nativeApp\)[\s\S]*<MessageLauncher/);
requireMatch(
  "Native assistant message action",
  aiConcierge,
  /nativeApp && result\.actionKind === "message"[\s\S]*<MessageLauncher[\s\S]*buttonLabel=\{lang === "en" \? "Message" : "Mensaje"\}/,
);
// En la web el asistente ofrece «Enviar mensaje»: el contacto por WhatsApp se
// abre desde la ficha, no desde una respuesta del asistente (28cd2273). Lo que
// el contrato vigila es que el rótulo siga existiendo en los dos idiomas.
requireMatch("Web assistant message copy", aiAssistantRoute, /"Send message"[\s\S]*"Enviar mensaje"/);
requireMatch("Global assistant", localeLayout, /<AiConcierge\s*\/>/);
requireMatch("Native footer hidden", globalCss, /\.ccr-native-app \.ccr-app-footer\s*\{\s*display:\s*none;/);
requireMatch(
  "Native content reserves bottom navigation",
  globalCss,
  /body\.ccr-native-app\.ccr-native-bottom-nav-visible:not\(\.ccr-native-search-route\) main[\s\S]*bottom:\s*var\(--ccr-native-bottom-nav-total\)/,
);
requireMatch(
  "Web regression keeps mobile messaging parked",
  defaultPlaywright,
  /testIgnore:\s*\["\*\*\/direct-chat\.spec\.ts",\s*"\*\*\/mobile-native-shell\.spec\.ts"\]/,
);
requireMatch("Mobile regression enables ignored tests", mobilePlaywright, /testIgnore:\s*\[\]/);
requireMatch("Mobile regression includes direct chat", mobilePlaywright, /"\*\*\/direct-chat\.spec\.ts"/);
requireMatch("Mobile regression includes native shell smoke", mobilePlaywright, /"\*\*\/mobile-native-shell\.spec\.ts"/);
requireMatch(
  "Spanish native bottom navigation smoke",
  mobileShellSpec,
  // La pestaña se llama «Promociones»; /promociones es solo la ruta heredada.
  /navItems:\s*\["Buscar",\s*"Promociones",\s*"Proyectos",\s*"Empleos",\s*"Panel"\]/,
);
requireMatch(
  "English native bottom navigation smoke",
  mobileShellSpec,
  /navItems:\s*\["Search",\s*"Promotions",\s*"Projects",\s*"Jobs",\s*"Panel"\]/,
);
requireMatch("Native assistant opens direct chat smoke", mobileShellSpec, /\/api\/direct-chat[\s\S]*actionKind:\s*"message"[\s\S]*\/mensajes\\\\\?conversation=/);
requireMatch("Mobile-only Playwright workflow", mobileWorkflow, /npm run test:e2e:mobile/);

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
