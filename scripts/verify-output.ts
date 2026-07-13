import { resolve } from 'node:path';
import { readFile } from 'node:fs/promises';
import { OutputVerifier } from '../src/adapters/output/output-verifier.js';

const directory = resolve(process.env.DELIVERABLES_DIR ?? 'deliverables');
const summary = JSON.parse(
  await readFile(resolve(directory, 'execution-summary.json'), 'utf8'),
) as {
  inputSha256: string;
  runId: string;
  urls: string[];
  successfulRecords: number;
  failedRecords: number;
};
const report = await new OutputVerifier().verifyOrThrow({
  inputSha256: summary.inputSha256,
  expectedRunId: summary.runId,
  expectedUrls: summary.urls,
  expectedSuccessfulRecords: summary.successfulRecords,
  expectedFailedRecords: summary.failedRecords,
  jsonlPath: resolve(directory, 'products.jsonl'),
  csvPath: resolve(directory, 'products.csv'),
  manifestPath: resolve(directory, 'artifacts-manifest.json'),
  reportPath: resolve(directory, 'output-verification.json'),
});
console.log(JSON.stringify(report));
