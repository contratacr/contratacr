import { execFileSync } from "node:child_process";

const output = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
const files = output.split("\0").filter(Boolean);

const trackedPrivateEnvFiles = files.filter((file) => {
  const name = file.split(/[\\/]/).pop() ?? file;
  if (!name.startsWith(".env")) return false;
  return !/\.(example|sample|template)$/i.test(name);
});

if (trackedPrivateEnvFiles.length > 0) {
  console.error("Private environment files must never be committed:");
  for (const file of trackedPrivateEnvFiles) console.error(`- ${file}`);
  console.error("Keep real values in GitHub/Vercel secrets or local ignored .env files only.");
  process.exit(1);
}

console.log("No private .env files are tracked.");
