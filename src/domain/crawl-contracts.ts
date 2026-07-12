import { z } from 'zod';

import { extractionSourceSchema, pageStateSchema } from './probe-contracts.js';
import {
  inputFormatSchema,
  invalidInputRecordSchema,
} from './input-contracts.js';
import { productOutputSchema } from './product-output.js';

export const crawlOperationalErrorCodeSchema = z.enum([
  'BROWSER_OPERATIONAL_ERROR',
  'EXTRACTION_ERROR',
  'UNEXPECTED_ERROR',
]);
export type CrawlOperationalErrorCode = z.infer<
  typeof crawlOperationalErrorCodeSchema
>;

const countSchema = z.number().int().nonnegative();

export const crawlAttemptSchema = z
  .object({
    attemptNumber: z.number().int().positive(),
    pageState: pageStateSchema,
    httpStatus: z.number().int().min(100).max(599).nullable(),
    operationalErrorCode: crawlOperationalErrorCodeSchema.nullable(),
    durationMs: z.number().nonnegative(),
    retryable: z.boolean(),
    retryScheduled: z.boolean(),
    retryDelayMs: z.number().int().nonnegative().nullable(),
    browserGeneration: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((attempt, context) => {
    if (attempt.retryScheduled !== (attempt.retryDelayMs !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Retry agendado exige delay.',
      });
    }
  });
export type CrawlAttempt = z.infer<typeof crawlAttemptSchema>;

export const crawlItemResultSchema = z
  .object({
    originalIndex: z.number().int().nonnegative(),
    lineNumber: z.number().int().positive().nullable(),
    merchantId: z.string().uuid(),
    itemId: z.string().uuid(),
    source: extractionSourceSchema,
    pageState: pageStateSchema,
    product: productOutputSchema,
    durationMs: z.number().nonnegative(),
    operationalErrorCode: crawlOperationalErrorCodeSchema.nullable(),
    httpStatus: z.number().int().min(100).max(599).nullable(),
    attempts: z.array(crawlAttemptSchema),
    attemptCount: countSchema,
    retryCount: countSchema,
    recoveredAfterRetry: z.boolean(),
  })
  .strict()
  .superRefine((result, context) => {
    const continuous = result.attempts.every(
      (attempt, index) =>
        attempt.attemptNumber === index + 1 &&
        (index === result.attempts.length - 1 || attempt.retryScheduled),
    );
    const final = result.attempts.at(-1);
    const consistent =
      result.attemptCount === result.attempts.length &&
      result.retryCount === Math.max(0, result.attemptCount - 1) &&
      continuous &&
      final !== undefined &&
      !final.retryScheduled &&
      final.pageState === result.pageState &&
      final.httpStatus === result.httpStatus &&
      final.operationalErrorCode === result.operationalErrorCode &&
      (!result.recoveredAfterRetry ||
        (result.retryCount > 0 && result.product.status === 'success'));
    if (!consistent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Histórico de tentativas inconsistente.',
      });
    }
  });
export type CrawlItemResult = z.infer<typeof crawlItemResultSchema>;

export const crawlBatchSummarySchema = z
  .object({
    totalRecords: countSchema,
    validRecords: countSchema,
    invalidRecords: countSchema,
    selectedRecords: countSchema,
    processedRecords: countSchema,
    successfulRecords: countSchema,
    failedRecords: countSchema,
    successRatePercent: z.number().min(0).max(100),
    recordsByPageState: z.record(pageStateSchema, countSchema),
    recordsBySource: z.record(extractionSourceSchema, countSchema),
    recordsByOperationalError: z.record(
      crawlOperationalErrorCodeSchema,
      countSchema,
    ),
    durationMs: z.number().nonnegative(),
    configuredConcurrency: z.number().int().min(1).max(20),
    maxObservedConcurrency: countSchema,
    totalAttempts: countSchema,
    retriedRecords: countSchema,
    retriesPerformed: countSchema,
    recoveredRecords: countSchema,
    exhaustedRetries: countSchema,
    skippedRecords: countSchema,
    browserRestarts: countSchema,
    circuitBreakerOpened: z.boolean(),
    circuitBreakerReason: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((summary, context) => {
    const expectedRate = calculateSuccessRatePercent(
      summary.successfulRecords,
      summary.processedRecords,
    );
    const inconsistencies = [
      summary.totalRecords !== summary.validRecords + summary.invalidRecords,
      summary.processedRecords !==
        summary.successfulRecords + summary.failedRecords,
      summary.selectedRecords !==
        summary.processedRecords + summary.skippedRecords,
      summary.selectedRecords > summary.validRecords,
      summary.successRatePercent !== expectedRate,
      summary.maxObservedConcurrency > summary.configuredConcurrency,
    ];
    if (inconsistencies.some(Boolean)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'As contagens do resumo batch são inconsistentes.',
      });
    }
  });
export type CrawlBatchSummary = z.infer<typeof crawlBatchSummarySchema>;

export const skippedInputSchema = z
  .object({
    originalIndex: z.number().int().nonnegative(),
    lineNumber: z.number().int().positive().nullable(),
    merchantId: z.string().uuid(),
    itemId: z.string().uuid(),
    reason: z.enum(['CIRCUIT_BREAKER_OPEN']),
  })
  .strict();

export const crawlBatchResultSchema = z
  .object({
    runId: z.string().min(1),
    source: z
      .object({
        fileName: z.string().min(1),
        format: inputFormatSchema,
      })
      .strict(),
    invalidRecords: z.array(invalidInputRecordSchema),
    skippedInputs: z.array(skippedInputSchema),
    results: z.array(crawlItemResultSchema),
    summary: crawlBatchSummarySchema,
  })
  .strict()
  .superRefine((batch, context) => {
    const successfulRecords = batch.results.filter(
      (result) => result.product.status === 'success',
    ).length;
    const failedRecords = batch.results.length - successfulRecords;
    const recordsByPageState = countResultsBy(
      batch.results,
      (result) => result.pageState,
    );
    const recordsBySource = countResultsBy(
      batch.results,
      (result) => result.source,
    );
    const recordsByOperationalError = countResultsBy(
      batch.results.filter((result) => result.operationalErrorCode !== null),
      (result) => result.operationalErrorCode ?? 'UNEXPECTED_ERROR',
    );
    const ordered = batch.results.every(
      (result, index) =>
        index === 0 ||
        result.originalIndex > (batch.results[index - 1]?.originalIndex ?? -1),
    );
    const totalAttempts = batch.results.reduce(
      (total, result) => total + result.attemptCount,
      0,
    );
    const retriesPerformed = batch.results.reduce(
      (total, result) => total + result.retryCount,
      0,
    );
    const exhaustedRetries = batch.results.filter(
      (result) => result.attempts.at(-1)?.retryable === true,
    ).length;
    const inconsistent =
      batch.invalidRecords.length !== batch.summary.invalidRecords ||
      batch.results.length !== batch.summary.processedRecords ||
      batch.skippedInputs.length !== batch.summary.skippedRecords ||
      totalAttempts !== batch.summary.totalAttempts ||
      retriesPerformed !== batch.summary.retriesPerformed ||
      batch.results.filter((result) => result.retryCount > 0).length !==
        batch.summary.retriedRecords ||
      batch.results.filter((result) => result.recoveredAfterRetry).length !==
        batch.summary.recoveredRecords ||
      exhaustedRetries !== batch.summary.exhaustedRetries ||
      batch.summary.circuitBreakerOpened !==
        (batch.summary.circuitBreakerReason !== null) ||
      successfulRecords !== batch.summary.successfulRecords ||
      failedRecords !== batch.summary.failedRecords ||
      !sameCounts(recordsByPageState, batch.summary.recordsByPageState) ||
      !sameCounts(recordsBySource, batch.summary.recordsBySource) ||
      !sameCounts(
        recordsByOperationalError,
        batch.summary.recordsByOperationalError,
      ) ||
      !ordered;
    if (inconsistent) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O conteúdo do relatório não corresponde ao resumo.',
      });
    }
  });
export type CrawlBatchResult = z.infer<typeof crawlBatchResultSchema>;

function countResultsBy<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = keyOf(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function sameCounts(
  actual: Readonly<Record<string, number>>,
  expected: Readonly<Record<string, number>>,
): boolean {
  const actualEntries = Object.entries(actual).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const expectedEntries = Object.entries(expected).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return JSON.stringify(actualEntries) === JSON.stringify(expectedEntries);
}

export function calculateSuccessRatePercent(
  successfulRecords: number,
  processedRecords: number,
): number {
  if (processedRecords === 0) {
    return 0;
  }
  return Math.round((successfulRecords / processedRecords) * 10_000) / 100;
}
