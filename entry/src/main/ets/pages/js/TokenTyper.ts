export type TokenFlushInfo = {
  fullText: string
  appended: string
  queueLength: number
  queueChars: number
}

type TokenTyperOptions = {
  flushIntervalMs?: number
  maxTokensPerFlush?: number
  maxCharsPerFlush?: number
  onFlush: (info: TokenFlushInfo) => void
}

export class TokenTyper {
  private tokens: string[] = []
  private queueChars = 0
  private timer?: number
  private paused = false
  private stopped = false
  private fullText = ''

  private flushIntervalMs: number
  private maxTokensPerFlush: number
  private maxCharsPerFlush: number
  private onFlush: (info: TokenFlushInfo) => void

  constructor(opts: TokenTyperOptions) {
    this.flushIntervalMs = opts.flushIntervalMs ?? 33
    this.maxTokensPerFlush = opts.maxTokensPerFlush ?? 8
    this.maxCharsPerFlush = opts.maxCharsPerFlush ?? 80
    this.onFlush = opts.onFlush
  }

  enqueueChunk(chunk: string) {
    if (this.stopped || !chunk) return
    const newTokens = tokenizeToTokens(chunk)
    for (let i = 0; i < newTokens.length; i++) {
      const t = newTokens[i]
      this.tokens.push(t)
      this.queueChars += t.length
    }
  }

  start() {
    if (this.stopped) return
    this.paused = false
    if (this.timer) return
    this.timer = setInterval(() => {
      if (this.stopped || this.paused) return
      this.flushOnce()
    }, this.flushIntervalMs)
  }

  pause() { this.paused = true }
  resume() { if (!this.stopped) { this.paused = false; if (!this.timer) this.start() } }

  flushNow() {
    if (this.stopped) return
    while (!this.paused && this.tokens.length) {
      const appended = this.drainTokens(this.maxTokensPerFlush * 20, this.maxCharsPerFlush * 20)
      if (!appended) break
      this.fullText += appended
      this.queueChars -= appended.length
      this.onFlush({ fullText: this.fullText, appended, queueLength: this.tokens.length, queueChars: this.queueChars })
    }
  }

  stop() {
    this.stopped = true
    this.paused = true
    if (this.timer) { clearInterval(this.timer); this.timer = undefined }
    this.tokens = []
    this.queueChars = 0
  }

  private flushOnce() {
    if (!this.tokens.length) return
    const appended = this.drainTokens(this.maxTokensPerFlush, this.maxCharsPerFlush)
    if (!appended) return
    this.fullText += appended
    this.queueChars -= appended.length
    this.onFlush({ fullText: this.fullText, appended, queueLength: this.tokens.length, queueChars: this.queueChars })
  }

  private drainTokens(maxTokens: number, maxChars: number): string {
    let out = ''
    let used = 0
    while (this.tokens.length && used < maxTokens && out.length < maxChars) {
      const t = this.tokens[0]
      if (out.length + t.length > maxChars) break
      out += t
      this.tokens.shift()
      used++
    }
    return out
  }
}

// token 规则：换行单独、标点单独、英文单词合并、中文按单字（打字机感更强）
function tokenizeToTokens(input: string): string[] {
  const tokens: string[] = []
  if (!input) return tokens

  const punct = new Set([
    '.', ',', '!', '?', ':', ';',
    '。', '，', '！', '？', '：', '；',
    '、', '（', '）', '(', ')', '[', ']', '{', '}',
    '《', '》', '<', '>', '"', "'", '“', '”', '‘', '’',
    '-', '—', '_', '+', '=', '/', '\\', '|', '@', '#', '$', '%', '^', '&', '*', '~'
  ])

  let buf = ''
  function flushBuf() { if (buf) { tokens.push(buf); buf = '' } }

  for (const ch of input) {
    if (ch === '\n') { flushBuf(); tokens.push('\n'); continue }
    if (ch === '\r') continue

    if (ch === ' ' || ch === '\t') { flushBuf(); tokens.push(ch); continue }
    if (punct.has(ch)) { flushBuf(); tokens.push(ch); continue }

    if (isAsciiWordChar(ch)) { buf += ch; continue }

    flushBuf()
    tokens.push(ch)
  }

  flushBuf()
  return tokens
}

function isAsciiWordChar(ch: string): boolean {
  const code = ch.charCodeAt(0)
  if (code >= 48 && code <= 57) return true
  if (code >= 65 && code <= 90) return true
  if (code >= 97 && code <= 122) return true
  if (code === 95) return true
  return false
}
