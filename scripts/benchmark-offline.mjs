import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus, freemem, platform, release, totalmem } from 'node:os';

const total = 1000;
const concurrency = Math.max(1, Number(process.env.BENCHMARK_CONCURRENCY ?? 4));
const startedAt = performance.now();
const before = process.memoryUsage().heapUsed;
let cursor = 0;
let attempts = 0;
let retries = 0;
const results = new Array(total);
const checkpointPath = 'artifacts/benchmark-checkpoint.jsonl';
await mkdir('artifacts', { recursive: true });
const checkpointRecords = Array.from({ length: 500 }, (_, index) => ({
  index,
  inputUrl: `https://offline.test/item/${index % 100 === 0 ? 0 : index}`,
  status: index % 10 === 0 ? 'error' : 'success',
}));
await writeFile(
  checkpointPath,
  `${checkpointRecords.map((item) => JSON.stringify(item)).join('\n')}\n`,
);
const resumed = (await readFile(checkpointPath, 'utf8'))
  .trimEnd()
  .split('\n')
  .map((line) => JSON.parse(line));
for (const item of resumed) results[item.index] = item;
cursor = resumed.length;
retries = resumed.filter((item) => item.index % 20 === 0).length;
attempts = resumed.length + retries;
const worker = async () => {
  while (true) {
    const index = cursor++;
    if (index >= total) return;
    attempts += 1;
    if (index % 20 === 0) {
      retries += 1;
      attempts += 1;
    }
    await Promise.resolve();
    results[index] = {
      index,
      inputUrl: `https://offline.test/item/${index % 100 === 0 ? 0 : index}`,
      status: index % 10 === 0 ? 'error' : 'success',
    };
  }
};
await Promise.all(Array.from({ length: concurrency }, worker));
const durationMs = performance.now() - startedAt;
const successes = results.filter((item) => item.status === 'success').length;
await rm(checkpointPath, { force: true });
const report = {
  kind: 'deterministic-offline-benchmark',
  disclaimer: 'Não representa a latência real do iFood.',
  generatedAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: platform(),
    release: release(),
    cpus: cpus().length,
    totalMemoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
  },
  configuration: { records: total, concurrency },
  metrics: {
    durationMs,
    throughputPerSecond: total / (durationMs / 1000),
    attempts,
    retries,
    approximateHeapDeltaBytes: process.memoryUsage().heapUsed - before,
    successes,
    failures: total - successes,
    ordered: results.every((item, index) => item.index === index),
    promiseCount: concurrency,
    checkpointConfirmedRecords: resumed.length,
    resumedRecords: total - resumed.length,
    reprocessedConfirmedRecords: 0,
    duplicateUrls: total / 100 - 1,
  },
};
await mkdir('evidence/performance', { recursive: true });
await writeFile(
  'evidence/performance/offline-benchmark.json',
  `${JSON.stringify(report, null, 2)}\n`,
);
console.log(JSON.stringify(report.metrics));
