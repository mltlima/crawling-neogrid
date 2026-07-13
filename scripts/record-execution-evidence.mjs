import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const report = JSON.parse(
  await readFile('deliverables/batch-report.json', 'utf8'),
);
const manifest = JSON.parse(
  await readFile('artifacts/checkpoints/official-full/manifest.json', 'utf8'),
);
const journal = (
  await readFile(
    'artifacts/checkpoints/official-full/results.journal.jsonl',
    'utf8',
  )
)
  .trimEnd()
  .split('\n')
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const commit = (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
let previous = null;
try {
  previous = JSON.parse(
    await readFile('evidence/execution/final-summary.json', 'utf8'),
  );
} catch {
  previous = null;
}
const previousAttempts =
  previous?.runId === report.runId
    ? (previous.attempts ?? [
        {
          finishedAt: previous.finishedAt,
          durationMs: previous.durationMs,
          processedRecords: previous.processedRecords,
        },
      ])
    : [];
const attempts = previousAttempts.some(
  (attempt) => attempt.finishedAt === manifest.updatedAt,
)
  ? previousAttempts
  : [
      ...previousAttempts,
      {
        finishedAt: manifest.updatedAt,
        durationMs: report.summary.durationMs,
        processedRecords: report.summary.processedRecords,
      },
    ];
const officialSuccessRatePercent =
  Math.round(
    (report.summary.successfulRecords / report.summary.selectedRecords) *
      10_000,
  ) / 100;
const summary = {
  status: manifest.status,
  reason: report.summary.circuitBreakerReason,
  runId: report.runId,
  commit,
  command:
    "npx tsx ./src/cli/index.ts crawl --headed --resume --input './input/ifood_urls_padrao_item_1000 - JULHO.xlsx' --concurrency 2 --min-request-interval 500 --max-retries 1 --circuit-breaker-threshold 5 --checkpoint-dir ./artifacts/checkpoints/official-full",
  environment: {
    node: process.version,
    playwright: '1.61.1',
    platform: process.platform,
  },
  inputSha256: manifest.input.sha256,
  startedAt: manifest.createdAt,
  finishedAt: manifest.updatedAt,
  durationMs: report.summary.durationMs,
  cumulativeActiveDurationMs: attempts.reduce(
    (total, attempt) => total + attempt.durationMs,
    0,
  ),
  attempts,
  selectedRecords: report.summary.selectedRecords,
  processedRecords: report.summary.processedRecords,
  successfulRecords: report.summary.successfulRecords,
  failedRecords: report.summary.failedRecords,
  skippedRecords: report.summary.skippedRecords,
  officialSuccessRatePercent,
  throughputPerSecond:
    report.summary.processedRecords / (report.summary.durationMs / 1000),
  retriesPerformed: report.summary.retriesPerformed,
  journalRecords: journal.length,
  uniqueJournalIndexes: new Set(journal.map((entry) => entry.originalIndex))
    .size,
  reprocessedConfirmedRecords:
    journal.length - new Set(journal.map((entry) => entry.originalIndex)).size,
  recordsByPageState: report.summary.recordsByPageState,
  circuitBreakerOpened: report.summary.circuitBreakerOpened,
  circuitBreakerReason: report.summary.circuitBreakerReason,
  checkpoint: 'artifacts/checkpoints/official-full',
  productsExported: false,
  limitation:
    'Acesso repetidamente bloqueado pelo site; execução pausada sem fabricar registros.',
};
await mkdir('evidence/execution', { recursive: true });
await writeFile(
  'evidence/execution/final-summary.json',
  `${JSON.stringify(summary, null, 2)}\n`,
);
await writeFile(
  'docs/execution-report.md',
  `# Relatório da execução oficial\n\nStatus: **${summary.status}** por **${summary.reason}**.\n\n- Run ID: ${summary.runId}\n- Entrada SHA-256: ${summary.inputSha256}\n- Selecionadas: ${summary.selectedRecords}\n- Processadas: ${summary.processedRecords}\n- Sucessos: ${summary.successfulRecords}\n- Falhas processadas: ${summary.failedRecords}\n- Não iniciadas: ${summary.skippedRecords}\n- Taxa oficial (sucessos/selecionadas): ${summary.officialSuccessRatePercent}%\n- Duração ativa acumulada: ${summary.cumulativeActiveDurationMs} ms\n- Tentativas de execução: ${summary.attempts.length}\n- Retries: ${summary.retriesPerformed}\n- Circuit breaker: ${summary.circuitBreakerReason}\n\n## Estados\n\n\`\`\`json\n${JSON.stringify(summary.recordsByPageState, null, 2)}\n\`\`\`\n\nO checkpoint preserva ${summary.processedRecords} resultados confirmados. Não foram gerados produtos para ${summary.skippedRecords} URLs não iniciadas e nenhum resultado foi fabricado. Uma retomada só deve ocorrer quando o acesso normal estiver disponível.\n`,
);
console.log(
  JSON.stringify({ status: summary.status, officialSuccessRatePercent }),
);
