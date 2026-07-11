import { z } from 'zod';

export const inputFormatSchema = z.enum(['xlsx', 'csv', 'txt', 'json']);
export type InputFormat = z.infer<typeof inputFormatSchema>;

export const receivedUrlSchema = z
  .object({
    originalIndex: z.number().int().nonnegative(),
    lineNumber: z.number().int().positive().nullable(),
    value: z.unknown(),
  })
  .strict();
export type ReceivedUrl = z.infer<typeof receivedUrlSchema>;

export const normalizedUrlSchema = z
  .object({
    value: z.string().url(),
    storeBaseUrl: z.string().url(),
    locality: z.string().min(1),
    storeSlug: z.string().min(1),
    merchantId: z.string().uuid(),
    itemId: z.string().uuid(),
  })
  .strict();
export type NormalizedUrl = z.infer<typeof normalizedUrlSchema>;

export const validInputRecordSchema = normalizedUrlSchema
  .omit({ value: true })
  .extend({
    originalIndex: z.number().int().nonnegative(),
    lineNumber: z.number().int().positive().nullable(),
    originalUrl: z.string(),
    normalizedUrl: z.string().url(),
  })
  .strict();
export type ValidInputRecord = z.infer<typeof validInputRecordSchema>;

export const inputValidationErrorCodeSchema = z.enum([
  'EMPTY_VALUE',
  'INVALID_URL',
  'INVALID_PROTOCOL',
  'INVALID_HOST',
  'EMBEDDED_CREDENTIALS',
  'CUSTOM_PORT',
  'INVALID_PATH',
  'MISSING_ITEM_ID',
  'INVALID_ITEM_ID',
  'INVALID_MERCHANT_ID',
]);
export type InputValidationErrorCode = z.infer<
  typeof inputValidationErrorCodeSchema
>;

export const invalidInputRecordSchema = z
  .object({
    originalIndex: z.number().int().nonnegative(),
    lineNumber: z.number().int().positive().nullable(),
    originalValue: z.unknown(),
    errorCode: inputValidationErrorCodeSchema,
    message: z.string().min(1),
  })
  .strict();
export type InvalidInputRecord = z.infer<typeof invalidInputRecordSchema>;

export const inputBatchSchema = z
  .object({
    sourcePath: z.string().min(1),
    format: inputFormatSchema,
    records: z.array(receivedUrlSchema),
  })
  .strict();
export type InputBatch = z.infer<typeof inputBatchSchema>;

export const duplicateKindSchema = z.enum([
  'FULL_URL',
  'ITEM_ID',
  'MERCHANT_ITEM',
]);

export const duplicateGroupSchema = z
  .object({
    kind: duplicateKindSchema,
    key: z.string().min(1),
    originalIndexes: z.array(z.number().int().nonnegative()).min(2),
  })
  .strict();
export type DuplicateGroup = z.infer<typeof duplicateGroupSchema>;

export const duplicateReportSchema = z
  .object({
    fullUrls: z.array(duplicateGroupSchema),
    itemIds: z.array(duplicateGroupSchema),
    merchantItems: z.array(duplicateGroupSchema),
  })
  .strict();
export type DuplicateReport = z.infer<typeof duplicateReportSchema>;

export const storeGroupSchema = z
  .object({
    merchantId: z.string().uuid(),
    storeBaseUrl: z.string().url(),
    locality: z.string().min(1),
    storeSlug: z.string().min(1),
    items: z.array(validInputRecordSchema).min(1),
    originalIndexes: z.array(z.number().int().nonnegative()).min(1),
  })
  .strict();
export type StoreGroup = z.infer<typeof storeGroupSchema>;

export const validationSummarySchema = z
  .object({
    totalRecords: z.number().int().nonnegative(),
    validRecords: z.number().int().nonnegative(),
    invalidRecords: z.number().int().nonnegative(),
    emptyRecords: z.number().int().nonnegative(),
    uniqueMerchants: z.number().int().nonnegative(),
    duplicateFullUrls: z.number().int().nonnegative(),
    duplicateItemIds: z.number().int().nonnegative(),
    duplicateMerchantItems: z.number().int().nonnegative(),
  })
  .strict();
export type ValidationSummary = z.infer<typeof validationSummarySchema>;

export const inputValidationResultSchema = z
  .object({
    batch: inputBatchSchema,
    validRecords: z.array(validInputRecordSchema),
    invalidRecords: z.array(invalidInputRecordSchema),
    duplicates: duplicateReportSchema,
    storeGroups: z.array(storeGroupSchema),
    summary: validationSummarySchema,
  })
  .strict();
export type InputValidationResult = z.infer<typeof inputValidationResultSchema>;
