import type { CrawlItemResult } from '../../domain/index.js';

export interface RetryDecisionInput {
  readonly result: CrawlItemResult;
  readonly browserConnected: boolean;
}

export function isRetryableFailure(input: RetryDecisionInput): boolean {
  const { result } = input;
  if (result.product.status === 'success') {
    return false;
  }
  if (
    result.pageState === 'ACCESS_BLOCKED' ||
    result.pageState === 'LOCATION_REQUIRED' ||
    result.pageState === 'PRODUCT_UNAVAILABLE' ||
    result.pageState === 'STORE_UNAVAILABLE' ||
    result.pageState === 'PARSER_ERROR'
  ) {
    return false;
  }
  if (
    result.pageState === 'NAVIGATION_TIMEOUT' ||
    result.pageState === 'RATE_LIMITED'
  ) {
    return true;
  }
  if (result.pageState === 'HTTP_ERROR') {
    return (
      result.httpStatus !== null &&
      result.httpStatus >= 500 &&
      result.httpStatus <= 599
    );
  }
  return (
    result.operationalErrorCode === 'BROWSER_OPERATIONAL_ERROR' &&
    !input.browserConnected
  );
}
