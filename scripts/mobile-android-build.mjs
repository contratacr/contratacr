import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const target = process.argv[2] === "release" ? "bundleRelease" : "assembleDebug";
const sdkRoot =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Android", "Sdk") : "");

if (!sdkRoot || !existsSync(sdkRoot)) {
  console.error("Android SDK not found. Install Android Studio or command-line tools and set ANDROID_HOME.");
  process.exit(1);
}

const gradle = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const result = spawnSync(gradle, [target], {
  cwd: "android",
  stdio: "inherit",
  shell: process.platform === "win32",
  env: {
    ...process.env,
    ANDROID_HOME: sdkRoot,
    ANDROID_SDK_ROOT: sdkRoot,
  },
});

process.exit(result.status ?? 1);
