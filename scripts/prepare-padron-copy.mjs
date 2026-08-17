import fs from "node:fs";
import readline from "node:readline";

const inputFile = process.argv[2];
const outputFile = process.argv[3];

if (!inputFile || !fs.existsSync(inputFile)) {
  console.error("Pass the path to padron_completo.txt");
  process.exit(1);
}

if (!outputFile) {
  console.error("Pass the output TSV path");
  process.exit(1);
}

function clean(value) {
  return String(value ?? "")
    .trim()
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\\/g, "\\\\");
}

const reader = readline.createInterface({
  input: fs.createReadStream(inputFile, { encoding: "latin1" }),
  crlfDelay: Infinity,
});
const writer = fs.createWriteStream(outputFile, { encoding: "utf8" });

let total = 0;
for await (const line of reader) {
  if (!line.trim()) continue;
  const fields = line.split(",");
  const cedula = clean(fields[0]);
  if (!cedula) continue;
  writer.write([cedula, clean(fields[4]), clean(fields[5]), clean(fields[6])].join("\t"));
  writer.write("\n");
  total += 1;
}

await new Promise((resolve, reject) => {
  writer.end(resolve);
  writer.on("error", reject);
});

console.log(`Prepared ${total} padron rows for COPY.`);
