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
  })
  .strict();
export type CrawlItemResult = z.infer<typeof crawlItemResultSchema>;

const countSchema = z.number().int().nonnegative();

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
      summary.selectedRecords !== summary.processedRecords,
      summary.selectedRecords > summary.validRecords,
      summary.successRatePercent !== expectedRate,
    ];
    if (inconsistencies.some(Boolean)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'As contagens do resumo batch são inconsistentes.',
      });
    }
  });
export type CrawlBatchSummary = z.infer<typeof crawlBatchSummarySchema>;

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
    results: z.array(crawlItemResultSchema),
    summary: crawlBatchSummarySchema,
  })
  .strict()
  .superRefine((batch, context) => {
    if (
      batch.invalidRecords.length !== batch.summary.invalidRecords ||
      batch.results.length !== batch.summary.processedRecords
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'O conteúdo do relatório não corresponde ao resumo.',
      });
    }
  });
export type CrawlBatchResult = z.infer<typeof crawlBatchResultSchema>;

export function calculateSuccessRatePercent(
  successfulRecords: number,
  processedRecords: number,
): number {
  if (processedRecords === 0) {
    return 0;
  }
  return Math.round((successfulRecords / processedRecords) * 10_000) / 100;
}
