import type { CrawlItemResult } from '../../domain/index.js';

export type CircuitBreakerReason =
  | 'ACCESS_BLOCKED_THRESHOLD'
  | 'RATE_LIMITED_THRESHOLD'
  | 'BROWSER_RECOVERY_FAILED';

export class SafetyCircuitBreaker {
  private accessBlocked = 0;
  private rateLimited = 0;
  private reasonValue: CircuitBreakerReason | null = null;

  public constructor(private readonly threshold: number) {}
  public get opened(): boolean {
    return this.reasonValue !== null;
  }
  public get reason(): CircuitBreakerReason | null {
    return this.reasonValue;
  }

  public record(result: CrawlItemResult, retriesExhausted: boolean): boolean {
    if (this.opened) {
      return false;
    }
    this.accessBlocked =
      result.pageState === 'ACCESS_BLOCKED' ? this.accessBlocked + 1 : 0;
    this.rateLimited =
      result.pageState === 'RATE_LIMITED' && retriesExhausted
        ? this.rateLimited + 1
        : 0;
    if (this.accessBlocked >= this.threshold) {
      this.reasonValue = 'ACCESS_BLOCKED_THRESHOLD';
    } else if (this.rateLimited >= this.threshold) {
      this.reasonValue = 'RATE_LIMITED_THRESHOLD';
    }
    return this.opened;
  }

  public openForRecoveryFailure(): void {
    this.reasonValue ??= 'BROWSER_RECOVERY_FAILED';
  }
}
