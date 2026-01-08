export class StreamController {
  private buffer = ''
  private lastFlush = 0

  constructor(
    private onFlush: (text: string) => void,
    private interval = 50 // ms
  ) {}

  push(chunk: string) {
    this.buffer += chunk
    const now = Date.now()

    if (now - this.lastFlush >= this.interval) {
      this.flush()
    }
  }

  flush() {
    if (!this.buffer) return
    this.onFlush(this.buffer)
    this.buffer = ''
    this.lastFlush = Date.now()
  }

  forceFlush() {
    this.flush()
  }
}
