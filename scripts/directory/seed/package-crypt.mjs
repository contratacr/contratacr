#!/usr/bin/env node
// Encrypts / decrypts the directory seed package (a tar.gz of SQL files) with AES-256-GCM.
// The repository is public, so the generated SQL is only committed encrypted; the key lives
// only in the GitHub Environments as SEED_PACKAGE_KEY (64 hex chars) and is never printed.
// Usage: SEED_PACKAGE_KEY=<hex> node package-crypt.mjs encrypt|decrypt <in> <out>
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const MAGIC = Buffer.from('CCRSEED1');
const [mode, input, output] = process.argv.slice(2);
const hex = process.env.SEED_PACKAGE_KEY ?? '';
if (!/^[0-9a-f]{64}$/i.test(hex)) { console.error('SEED_PACKAGE_KEY must be 64 hex characters.'); process.exit(2); }
if (!['encrypt', 'decrypt'].includes(mode) || !input || !output) {
  console.error('Usage: node package-crypt.mjs encrypt|decrypt <in> <out>'); process.exit(2);
}
const key = Buffer.from(hex, 'hex');
const data = readFileSync(input);
if (mode === 'encrypt') {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  writeFileSync(output, Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]));
} else {
  if (!data.subarray(0, 8).equals(MAGIC)) { console.error('Not a seed package.'); process.exit(2); }
  const decipher = createDecipheriv('aes-256-gcm', key, data.subarray(8, 20));
  decipher.setAuthTag(data.subarray(20, 36));
  writeFileSync(output, Buffer.concat([decipher.update(data.subarray(36)), decipher.final()]));
}
console.log(`${mode}ed ${data.length} bytes`);
