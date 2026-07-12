import { z } from 'zod';

import { productOutputSchema } from './product-output.js';

export const pageStateSchema = z.enum([
  'PRODUCT_FOUND',
  'PRODUCT_UNAVAILABLE',
  'STORE_UNAVAILABLE',
  'LOCATION_REQUIRED',
  'REDIRECTED_TO_HOME',
  'ACCESS_BLOCKED',
  'RATE_LIMITED',
  'NAVIGATION_TIMEOUT',
  'HTTP_ERROR',
  'PARSER_ERROR',
  'UNKNOWN_PAGE_STATE',
]);
export type PageState = z.infer<typeof pageStateSchema>;

export const extractionSourceSchema = z.enum([
  'network',
  'embedded-data',
  'dom',
  'none',
]);
export type ExtractionSource = z.infer<typeof extractionSourceSchema>;

export const responseSummarySchema = z
  .object({
    url: z.string().url(),
    method: z.string().min(1),
    status: z.number().int(),
    contentType: z.string(),
    durationMs: z.number().nonnegative(),
    approximateSizeBytes: z.number().int().nonnegative(),
    possibleProductData: z.boolean(),
    payloadTruncated: z.boolean(),
  })
  .strict();
export type ResponseSummary = z.infer<typeof responseSummarySchema>;

export interface ResponseCandidate {
  readonly summary: ResponseSummary;
  readonly jsonPayload: unknown;
}

export interface DomSnapshot {
  readonly title: string | null;
  readonly normalPrice: string | null;
  readonly discountPrice: string | null;
  readonly imageUrl: string | null;
  readonly bodyText: string;
}

export interface PageProbe {
  readonly finalUrl: string;
  readonly httpStatus: number | null;
  readonly retryAfterMs?: number | null;
  readonly html: string;
  readonly responses: readonly ResponseCandidate[];
  readonly consoleErrors: readonly string[];
  readonly pageErrors: readonly string[];
  readonly dom: DomSnapshot;
  readonly timedOut: boolean;
  readonly screenshot: Uint8Array;
  readonly trace: Uint8Array | null;
}

export const probeResultSchema = z
  .object({
    runId: z.string().min(1),
    source: extractionSourceSchema,
    pageState: pageStateSchema,
    product: productOutputSchema,
    artifactsDirectory: z.string().min(1),
    durationMs: z.number().nonnegative(),
  })
  .strict();
export type ProbeResult = z.infer<typeof probeResultSchema>;
