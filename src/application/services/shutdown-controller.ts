export class ShutdownController {
  private requested = false;
  private immediate = false;
  public request(): void {
    if (this.requested) {
      this.immediate = true;
    } else {
      this.requested = true;
    }
  }
  public get shouldStop(): boolean {
    return this.requested;
  }
  public get shouldTerminateImmediately(): boolean {
    return this.immediate;
  }
}
