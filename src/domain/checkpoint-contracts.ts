import { z } from 'zod';

import { crawlItemResultSchema } from './crawl-contracts.js';
import { inputFormatSchema } from './input-contracts.js';
import { productOutputSchema } from './product-output.js';

export const CHECKPOINT_SCHEMA_VERSION = 1;
export const runStatusSchema = z.enum([
  'CREATED',
  'RUNNING',
  'INTERRUPTING',
  'PAUSED',
  'COMPLETED',
  'FAILED',
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runManifestSchema = z
  .object({
    schemaVersion: z.literal(CHECKPOINT_SCHEMA_VERSION),
    runId: z.string().min(1),
    status: runStatusSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    input: z
      .object({
        fileName: z.string().min(1),
        format: inputFormatSchema,
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
    totalRecords: z.number().int().nonnegative(),
    validRecords: z.number().int().nonnegative(),
    selectedRecords: z.number().int().nonnegative(),
    limit: z.number().int().positive().nullable(),
    selectedInputs: z.array(
      z
        .object({
          originalIndex: z.number().int().nonnegative(),
          merchantId: z.string().uuid(),
          itemId: z.string().uuid(),
        })
        .strict(),
    ),
    effectiveConfig: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
    appVersion: z.string().min(1).nullable(),
    completedRecords: z.number().int().nonnegative(),
    pendingRecords: z.number().int().nonnegative(),
    skippedRecords: z.number().int().nonnegative(),
    files: z
      .object({
        resultsJournal: z.literal('results.journal.jsonl'),
        eventsJournal: z.literal('events.journal.jsonl'),
      })
      .strict(),
  })
  .strict()
  .superRefine((manifest, context) => {
    if (
      manifest.selectedRecords !==
        manifest.completedRecords +
          manifest.pendingRecords +
          manifest.skippedRecords ||
      manifest.selectedInputs.length !== manifest.selectedRecords
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Contadores do manifesto são inconsistentes.',
      });
    }
  });
export type RunManifest = z.infer<typeof runManifestSchema>;

export const checkpointResultSchema = z
  .object({
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
    originalIndex: z.number().int().nonnegative(),
    result: crawlItemResultSchema,
  })
  .strict();
export type CheckpointResult = z.infer<typeof checkpointResultSchema>;

export const checkpointEventSchema = z
  .object({
    at: z.string().datetime(),
    type: z.enum([
      'CREATED',
      'STARTED',
      'INTERRUPT_REQUESTED',
      'RESUMED',
      'CONFIG_CHANGED',
      'CIRCUIT_BREAKER_OPENED',
      'COMPLETED',
      'FAILED',
      'REPAIRED_JOURNAL',
    ]),
    details: z.record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    ),
  })
  .strict();
export type CheckpointEvent = z.infer<typeof checkpointEventSchema>;

export const artifactManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().min(1),
    inputSha256: z.string().regex(/^[a-f0-9]{64}$/),
    generatedAt: z.string().datetime(),
    productsCount: z.number().int().nonnegative(),
    pricesInCents: z.literal(true),
    summary: z
      .object({
        successfulRecords: z.number().int().nonnegative(),
        failedRecords: z.number().int().nonnegative(),
      })
      .strict(),
    files: z
      .array(
        z
          .object({
            fileName: z
              .string()
              .min(1)
              .refine((value) => !value.includes('/') && !value.includes('\\')),
            sizeBytes: z.number().int().nonnegative(),
            sha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();
export type ArtifactManifest = z.infer<typeof artifactManifestSchema>;

export const finalProductSchema = productOutputSchema;
