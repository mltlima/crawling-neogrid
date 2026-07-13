import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const directory = process.env.DELIVERABLES_DIR ?? 'deliverables';
const required = [
  'products.jsonl',
  'products.csv',
  'batch-report.json',
  'artifacts-manifest.json',
  'output-verification.json',
  'execution-summary.json',
  'execution-report.md',
  'SHA256SUMS',
];
const names = await readdir(directory);
for (const name of required)
  if (!names.includes(name)) throw new Error(`Entregável ausente: ${name}`);
const verification = JSON.parse(
  await readFile(join(directory, 'output-verification.json'), 'utf8'),
);
if (verification.valid !== true)
  throw new Error('Verificação de output inválida.');
const summary = JSON.parse(
  await readFile(join(directory, 'execution-summary.json'), 'utf8'),
);
const manifest = JSON.parse(
  await readFile(join(directory, 'artifacts-manifest.json'), 'utf8'),
);
if (
  summary.runId !== manifest.runId ||
  summary.selectedRecords !== manifest.productsCount ||
  summary.successfulRecords + summary.failedRecords !== summary.selectedRecords
) {
  throw new Error('Métricas da entrega são inconsistentes.');
}
const sums = await readFile(join(directory, 'SHA256SUMS'), 'utf8');
for (const line of sums.trim().split('\n')) {
  const [expected, name] = line.split(/\s{2}/);
  const actual = createHash('sha256')
    .update(await readFile(join(directory, name)))
    .digest('hex');
  if (actual !== expected) throw new Error(`Checksum divergente: ${name}`);
}
const forbidden = names.filter((name) => /trace|cookie|storage/i.test(name));
if (forbidden.length)
  throw new Error(`Arquivo proibido: ${forbidden.join(', ')}`);
const secretPattern =
  /(?:authorization\s*[:=]|bearer\s+[a-z0-9._-]+|api[_-]?key\s*[:=]|password\s*[:=]|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----)/i;
for (const name of names.filter((entry) =>
  /\.(?:json|jsonl|csv|md|log)$/i.test(entry),
)) {
  if (secretPattern.test(await readFile(join(directory, name), 'utf8'))) {
    throw new Error(`Possível segredo em ${name}.`);
  }
}
console.log(JSON.stringify({ valid: true, files: names.length }));
