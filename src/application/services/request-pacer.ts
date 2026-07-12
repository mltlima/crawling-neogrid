export interface PacerClock {
  now(): number;
  sleep(delayMs: number): Promise<void>;
}

export class RequestPacer {
  private tail: Promise<void> = Promise.resolve();
  private nextStartAt = 0;

  public constructor(
    private readonly intervalMs: number,
    private readonly clock: PacerClock,
  ) {}

  public wait(): Promise<void> {
    const turn = this.tail.then(async () => {
      const delay = Math.max(0, this.nextStartAt - this.clock.now());
      if (delay > 0) {
        await this.clock.sleep(delay);
      }
      this.nextStartAt = this.clock.now() + this.intervalMs;
    });
    this.tail = turn.catch(() => undefined);
    return turn;
  }
}
