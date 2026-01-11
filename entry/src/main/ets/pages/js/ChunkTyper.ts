type FlushInfo = {
  fullText: string        // 当前累计的完整 Markdown
  appended: string        // 本次 flush 追加的内容（合并后的）
  queueLength: number
}

type ChunkTyperOptions = {
  flushIntervalMs?: number      // flush 节奏：33ms≈30fps，50ms≈20fps
  maxCharsPerFlush?: number     // 单次 flush 最大追加字符数，避免一次性更新过大
  maxQueueChars?: number        // 队列上限（防止网络过快导致内存涨）
  onFlush: (info: FlushInfo) => void
}

export class ChunkTyper {
  private queue: string[] = []
  private queueChars = 0
  private timer?: number
  private paused = false
  private stopped = false

  private fullText = ''

  private flushIntervalMs: number
  private maxCharsPerFlush: number
  private maxQueueChars: number
  private onFlush: (info: FlushInfo) => void

  constructor(opts: ChunkTyperOptions) {
    this.flushIntervalMs = opts.flushIntervalMs ?? 33
    this.maxCharsPerFlush = opts.maxCharsPerFlush ?? 1200
    this.maxQueueChars = opts.maxQueueChars ?? 200_000
    this.onFlush = opts.onFlush
  }

  /** 追加一段 chunk（来自 SSE message.data） */
  enqueue(chunk: string) {
    if (this.stopped) return
    if (!chunk) return

    // 队列上限保护：超了就丢最老的（也可以改成直接暂停接收/报错）
    const incomingLen = chunk.length
    if (this.queueChars + incomingLen > this.maxQueueChars) {
      while (this.queue.length && this.queueChars + incomingLen > this.maxQueueChars) {
        const old = this.queue.shift()!
        this.queueChars -= old.length
      }
    }

    this.queue.push(chunk)
    this.queueChars += incomingLen
  }

  /** 获取当前完整文本 */
  getText(): string {
    return this.fullText
  }

  /** 开始/恢复输出 */
  start() {
    if (this.stopped) return
    this.paused = false
    if (this.timer) return

    this.timer = setInterval(() => {
      if (this.stopped || this.paused) return
      this.flushOnce()
    }, this.flushIntervalMs)
  }

  pause() {
    this.paused = true
  }

  resume() {
    if (this.stopped) return
    this.paused = false
    // 没有 timer 的话也拉起来
    if (!this.timer) this.start()
  }

  /** 立刻把队列尽可能输出一次（例如 done / 页面销毁前） */
  flushNow() {
    if (this.stopped) return
    // 为了稳，也可以多次 flushOnce；这里直接尽量吐完
    while (!this.paused && this.queue.length) {
      const appended = this.drainUpTo(this.maxCharsPerFlush * 4) // done 时可以吐多点
      if (!appended) break
      this.fullText += appended
      this.queueChars -= appended.length
      this.onFlush({ fullText: this.fullText, appended, queueLength: this.queue.length })
      // 给 UI 一点喘息也行：如果你担心长文瞬间渲染，可删掉这段 while 改成只 flushOnce
    }
  }

  stop() {
    this.stopped = true
    this.paused = true
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
    this.queue = []
    this.queueChars = 0
  }

  /** 单次 flush：合并多段 chunk 输出（稳的关键） */
  private flushOnce() {
    if (!this.queue.length) return

    const appended = this.drainUpTo(this.maxCharsPerFlush)
    if (!appended) return

    this.fullText += appended
    this.queueChars -= appended.length

    this.onFlush({
      fullText: this.fullText,
      appended,
      queueLength: this.queue.length
    })
  }

  /** 从队列里合并取出 <= limitChars 的文本 */
  private drainUpTo(limitChars: number): string {
    if (limitChars <= 0) return ''

    let out = ''
    while (this.queue.length && out.length < limitChars) {
      const head = this.queue[0]
      const canTake = limitChars - out.length
      if (head.length <= canTake) {
        out += head
        this.queue.shift()
      } else {
        out += head.slice(0, canTake)
        this.queue[0] = head.slice(canTake)
      }
    }
    return out
  }
}
