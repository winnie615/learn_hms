type RenderThrottlerOptions = {
  intervalMs?: number
  onRender: (text: string) => void
}

export class RenderThrottler {
  private timer?: number
  private pendingText: string | null = null
  private lastRenderedText = ''

  private intervalMs: number
  private onRender: (text: string) => void

  constructor(opts: RenderThrottlerOptions) {
    this.intervalMs = opts.intervalMs ?? 80
    this.onRender = opts.onRender
  }

  push(text: string) {
    if (text === this.lastRenderedText) return
    this.pendingText = text
    if (this.timer) return

    this.timer = setTimeout(() => {
      this.timer = undefined
      if (this.pendingText == null) return
      const latest = this.pendingText
      this.pendingText = null
      this.lastRenderedText = latest
      this.onRender(latest)
    }, this.intervalMs)
  }

  flushNow() {
    if (this.pendingText == null) return
    const latest = this.pendingText
    this.pendingText = null
    this.lastRenderedText = latest
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.onRender(latest)
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    this.pendingText = null
  }
}
