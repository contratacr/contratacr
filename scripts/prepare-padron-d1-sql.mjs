import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const inputFile = process.argv[2];
const outputDir = process.argv[3];
const batchSize = Number.parseInt(process.env.PADRON_D1_BATCH_SIZE ?? "250", 10);
const rowsPerFile = Number.parseInt(process.env.PADRON_D1_ROWS_PER_FILE ?? "100000", 10);
const rowLimit = Number.parseInt(process.env.PADRON_D1_ROW_LIMIT ?? "0", 10);

if (!inputFile || !fs.existsSync(inputFile)) {
  console.error("Pass the path to a prepared padrón TSV file.");
  process.exit(1);
}

if (!outputDir) {
  console.error("Pass the output directory for D1 SQL chunks.");
  process.exit(1);
}

if (!Number.isFinite(batchSize) || batchSize < 1) {
  console.error("PADRON_D1_BATCH_SIZE must be a positive integer.");
  process.exit(1);
}

if (!Number.isFinite(rowsPerFile) || rowsPerFile < batchSize) {
  console.error("PADRON_D1_ROWS_PER_FILE must be >= PADRON_D1_BATCH_SIZE.");
  process.exit(1);
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

function sql(value) {
  return `'${String(value ?? "").replace(/'/g, "''")}'`;
}

function sqlTuple(row) {
  return `(${sql(row.cedula)}, ${sql(row.nombre)}, ${sql(row.papellido)}, ${sql(row.sapellido)})`;
}

function chunkName(index) {
  return path.join(outputDir, `${String(index).padStart(4, "0")}.sql`);
}

const reader = readline.createInterface({
  input: fs.createReadStream(inputFile, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

let currentFile = null;
let currentFilePath = null;
let fileIndex = 0;
let chunkCount = 0;
let rowsInFile = 0;
let pendingTuples = [];
let total = 0;

function openFile() {
  if (currentFile) return;
  currentFilePath = chunkName(fileIndex);
  currentFile = fs.createWriteStream(currentFilePath, { encoding: "utf8" });
  rowsInFile = 0;
}

async function closeFile() {
  if (!currentFile) return;
  if (rowsInFile === 0) {
    const file = currentFile;
    const filePath = currentFilePath;
    await new Promise((resolve, reject) => {
      file.end(resolve);
      file.on("error", reject);
    });
    currentFile = null;
    currentFilePath = null;
    if (filePath) fs.rmSync(filePath, { force: true });
    return;
  }
  flushBatch();
  await new Promise((resolve, reject) => {
    currentFile.end(resolve);
    currentFile.on("error", reject);
  });
  currentFile = null;
  currentFilePath = null;
  fileIndex += 1;
  chunkCount += 1;
}

function flushBatch() {
  if (!pendingTuples.length || !currentFile) return;
  currentFile.write("insert or replace into padron_next (cedula, nombre, papellido, sapellido) values\n");
  currentFile.write(pendingTuples.join(",\n"));
  currentFile.write(";\n");
  pendingTuples = [];
}

for await (const line of reader) {
  if (rowLimit > 0 && total >= rowLimit) break;
  if (!line.trim()) continue;

  const [cedula, nombre, papellido, sapellido] = line.split("\t");
  if (!cedula) continue;

  openFile();
  pendingTuples.push(sqlTuple({ cedula, nombre, papellido, sapellido }));
  rowsInFile += 1;
  total += 1;

  if (pendingTuples.length >= batchSize) flushBatch();
  if (rowsInFile >= rowsPerFile) {
    await closeFile();
    openFile();
  }
}

await closeFile();

console.log(`Prepared ${total} padrón rows in ${chunkCount} D1 SQL chunk(s).`);
