import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

const directory = process.env.DELIVERABLES_DIR ?? 'deliverables';
const input =
  process.env.INPUT_FILE ?? 'input/ifood_urls_padrao_item_1000 - JULHO.xlsx';
const [reportRaw, manifestRaw, productsRaw, inputBytes] = await Promise.all([
  readFile(join(directory, 'batch-report.json'), 'utf8'),
  readFile(join(directory, 'artifacts-manifest.json'), 'utf8'),
  readFile(join(directory, 'products.jsonl'), 'utf8'),
  readFile(input),
]);
const report = JSON.parse(reportRaw);
const manifest = JSON.parse(manifestRaw);
const products = productsRaw
  .trimEnd()
  .split('\n')
  .filter(Boolean)
  .map(JSON.parse);
const inputSha256 = createHash('sha256').update(inputBytes).digest('hex');
if (manifest.inputSha256 !== inputSha256 || report.runId !== manifest.runId)
  throw new Error('Execução e manifest incompatíveis.');
const summary = {
  runId: report.runId,
  inputFile: basename(input),
  inputSha256,
  generatedAt: new Date().toISOString(),
  urls: products.map((product) => product.product_url),
  ...report.summary,
};
await writeFile(
  join(directory, 'execution-summary.json'),
  `${JSON.stringify(summary, null, 2)}\n`,
);
await writeFile(
  join(directory, 'execution-report.md'),
  `# Relatório da execução\n\n- Run ID: ${report.runId}\n- Entrada: ${basename(input)}\n- Selecionadas: ${report.summary.selectedRecords}\n- Sucessos: ${report.summary.successfulRecords}\n- Falhas: ${report.summary.failedRecords}\n- Taxa oficial: ${report.summary.successRatePercent}%\n- Duração: ${report.summary.durationMs} ms\n\n## Estados\n\n\`\`\`json\n${JSON.stringify(report.summary.recordsByPageState, null, 2)}\n\`\`\`\n`,
);
const checksumFiles = [
  'products.jsonl',
  'products.csv',
  'batch-report.json',
  'artifacts-manifest.json',
  'output-verification.json',
  'execution-summary.json',
  'execution-report.md',
];
const lines = [];
for (const name of checksumFiles)
  lines.push(
    `${createHash('sha256')
      .update(await readFile(join(directory, name)))
      .digest('hex')}  ${name}`,
  );
await writeFile(join(directory, 'SHA256SUMS'), `${lines.join('\n')}\n`);
