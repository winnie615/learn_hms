import http from '@ohos.net.http'
import { util } from '@kit.ArkTS'

/* =========================================================
 * 类型定义
 * ======================================================= */

type SSEMessage = {
  data: string
  lastEventId?: string
  event?: string
}

type StateChangePayload = {
  state: number
  retryCount: number
  retryInterval: number
  nextRetryDelay?: number
  reason?: string
  lastEventId: string
  timestamp: number
}

type SSEEventMap = {
  open: void
  message: SSEMessage
  error: string
  done: void
  statechange: StateChangePayload
  // 支持任意自定义 event
  [key: string]: any
}

type Listener<T> = (payload: T) => void

/* =========================================================
 * 常量
 * ======================================================= */

const LF = 10
const DEFAULT_RETRY = 3000
const MAX_RETRY = 10

/* =========================================================
 * EventSource（ArkTS 纯实现）
 * ======================================================= */

export default class EventSource {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  private state = EventSource.CONNECTING

  private listeners = new Map<string, Set<Listener<any>>>()
  private httpClient?: http.HttpRequest

  private lastEventId = ''
  private retryInterval = DEFAULT_RETRY
  private retryCount = 0

  private buffer = new Uint8Array(0)
  private dataBuffer = ''
  private eventName?: string

  private lastReceiveTime = Date.now()
  private heartbeatTimer?: number

  // ✅ 区分“手动关闭”和“错误断开”
  private manuallyClosed = false

  // ✅ 复用 decoder
  private decoder = util.TextDecoder.create('utf-8')

  // ✅ 保存回调引用，便于 off
  private readonly onDataReceive = (chunk: ArrayBuffer) => {
    this.lastReceiveTime = Date.now()
    this.parseChunk(new Uint8Array(chunk))
  }

  private readonly onHeadersReceive = (headers: any) => {
    // 预检 Content-Type（拿不到也不影响，requestInStream 回调里还有一次校验）
    const ct = this.getHeaderValue(headers, 'content-type')
    if (ct && !ct.toLowerCase().includes('text/event-stream')) {
      this.handleError(`not sse: content-type=${ct}`)
    }
  }

  private readonly onDataEnd = () => {
    // 流结束是否重连：看业务需要
    // if (!this.manuallyClosed) this.handleError('stream ended')
  }

  constructor(
    private url: string,
    private heartbeatTimeout = 30000,
    private autoCloseOnDone = true,
    private headers?: Record<string, string>
  ) {
    this.connect()
  }

  /* =======================================================
   * 对外状态
   * ===================================================== */

  get readyState(): number {
    return this.state
  }

  get isOpen(): boolean {
    return this.state === EventSource.OPEN
  }

  /**
   * 手动触发重连（比如 UI 上“重试”按钮）
   * - 不会把 manuallyClosed 置回 false（如果你已经 close()，需要新建实例更安全）
   */
  reconnect() {
    if (this.manuallyClosed) return
    this.retryCount = 0
    this.connect()
  }

  /* =======================================================
   * 事件系统
   * ===================================================== */

  on<K extends string>(type: K, listener: Listener<SSEEventMap[K]>) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }

  off<K extends string>(type: K, listener: Listener<SSEEventMap[K]>) {
    this.listeners.get(type)?.delete(listener)
  }

  private emit<K extends string>(type: K, payload: SSEEventMap[K]) {
    this.listeners.get(type)?.forEach(fn => fn(payload))
  }

  private emitState(reason?: string, nextRetryDelay?: number, force = false) {
    // force=true 时即使 state 不变也发 statechange（常用于“重连倒计时/原因更新”）
    if (force || this.listeners.has('statechange')) {
      if (!force && !this.listeners.has('statechange')) return
      this.emit('statechange', {
        state: this.state,
        retryCount: this.retryCount,
        retryInterval: this.retryInterval,
        nextRetryDelay,
        reason,
        lastEventId: this.lastEventId,
        timestamp: Date.now()
      })
    }
  }

  private setState(next: number, reason?: string, nextRetryDelay?: number, forceEmit = false) {
    const changed = this.state !== next
    this.state = next
    if (changed || forceEmit) this.emitState(reason, nextRetryDelay, true)
  }

  /* =======================================================
   * 建立连接
   * ===================================================== */

  private connect() {
    if (this.manuallyClosed) return

    // 清理旧连接资源（错误重连场景不会把状态永久 CLOSED）
    this.cleanup(true)

    this.setState(EventSource.CONNECTING, 'connecting', undefined, true)

    this.httpClient = http.createHttp()

    this.lastReceiveTime = Date.now()
    this.startHeartbeat()

    // 订阅事件（不同版本实现可能不一致，做容错）
    try {
      this.httpClient.on('headersReceive', this.onHeadersReceive as any)
      this.httpClient.on('dataReceive', this.onDataReceive as any)
      this.httpClient.on('dataEnd', this.onDataEnd as any)
    } catch (_) {}

    const reqHeaders: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...(this.lastEventId ? { 'Last-Event-ID': this.lastEventId } : {}),
      ...(this.headers || {})
    }

    this.httpClient.requestInStream(
      this.url,
      {
        method: http.RequestMethod.GET,
        header: reqHeaders,
        readTimeout: 0,
        connectTimeout: 0
      } as any,
      (err: any, data?: any) => {
        if (err) {
          this.handleError(err?.message ?? String(err))
          return
        }

        // ✅ 校验响应码（拿不到就跳过，但尽量校验）
        const code = data?.responseCode
        if (typeof code === 'number' && code !== 200) {
          this.handleError(`bad status code: ${code}`)
          return
        }

        // ✅ 校验 Content-Type（拿不到就跳过，但尽量校验）
        const ct =
          this.getHeaderValue(data?.header, 'content-type') ??
          this.getHeaderValue(data?.headers, 'content-type')

        if (ct && !ct.toLowerCase().includes('text/event-stream')) {
          this.handleError(`not sse: content-type=${ct}`)
          return
        }

        // 连接成功
        this.retryCount = 0
        this.setState(EventSource.OPEN, 'open', undefined, true)
        this.emit('open', undefined)
      }
    )
  }

  /* =======================================================
   * 心跳检测
   * ===================================================== */

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.manuallyClosed) return
      if (Date.now() - this.lastReceiveTime > this.heartbeatTimeout) {
        this.handleError('heartbeat timeout')
      }
    }, this.heartbeatTimeout / 2)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
  }

  private decode(bytes: Uint8Array): string {
    return this.decoder.decodeToString(bytes)
  }

  /* =======================================================
   * 数据解析（A: data: xxxx 纯文本/markdown片段）
   * ===================================================== */

  private parseChunk(chunk: Uint8Array) {
    const merged = new Uint8Array(this.buffer.length + chunk.length)
    merged.set(this.buffer)
    merged.set(chunk, this.buffer.length)
    this.buffer = merged

    let pos = 0
    while (pos < this.buffer.length) {
      const lfIndex = this.buffer.indexOf(LF, pos)
      if (lfIndex === -1) break

      const lineBytes = this.buffer.slice(pos, lfIndex)
      pos = lfIndex + 1

      this.parseLine(this.decode(lineBytes))
    }

    this.buffer = this.buffer.slice(pos)
  }

  private parseLine(line: string) {
    if (line.endsWith('\r')) line = line.slice(0, -1)

    // SSE 注释行（: keep-alive）—— 视为心跳即可忽略
    if (line.startsWith(':')) return

    // 空行：一个 event 结束
    if (line === '') {
      if (!this.dataBuffer) {
        this.eventName = undefined
        return
      }

      // ✅ 不要 trim/trimEnd：只移除我们拼接时追加的最后一个 '\n'
      let data = this.dataBuffer
      if (data.endsWith('\n')) data = data.slice(0, -1)

      const event = this.eventName || 'message'
      this.dataBuffer = ''
      this.eventName = undefined

      if (data === '[DONE]') {
        this.emit('done', undefined)
        if (this.autoCloseOnDone) this.close()
        return
      }

      this.emit(event, { data, lastEventId: this.lastEventId, event })
      return
    }

    const colonIndex = line.indexOf(':')
    const field = colonIndex > -1 ? line.slice(0, colonIndex) : line

    // ✅ 只移除 value 的一个前导空格（符合 SSE 规则），不要 trim()
    let value = colonIndex > -1 ? line.slice(colonIndex + 1) : ''
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'data') this.dataBuffer += value + '\n'
    else if (field === 'id') this.lastEventId = value
    else if (field === 'retry') this.retryInterval = Number(value) || DEFAULT_RETRY
    else if (field === 'event') this.eventName = value
  }

  /* =======================================================
   * 错误处理 & 重连
   * ===================================================== */

  private handleError(reason: string) {
    if (this.manuallyClosed) return

    this.emit('error', reason)

    // ✅ 错误断开：清理资源，但不要永久 CLOSED（否则会挡住重连）
    this.cleanup(true)
    this.setState(EventSource.CONNECTING, reason, undefined, true)

    if (++this.retryCount > MAX_RETRY) {
      // 达到最大次数：不再自动重连，但仍保持可手动 reconnect()
      this.setState(EventSource.CLOSED, 'max retries exceeded', undefined, true)
      return
    }

    const delay = Math.min(
      this.retryInterval * Math.pow(2, this.retryCount - 1),
      30000
    )

    // ✅ 把“下一次重连延迟”通过 statechange 抛给 UI
    this.emitState(reason, delay, true)

    setTimeout(() => this.connect(), delay)
  }

  private cleanup(keepState: boolean) {
    this.stopHeartbeat()

    try {
      this.httpClient?.off?.('headersReceive', this.onHeadersReceive as any)
      this.httpClient?.off?.('dataReceive', this.onDataReceive as any)
      this.httpClient?.off?.('dataEnd', this.onDataEnd as any)

      // 有些实现是 off(event) 不带 callback
      this.httpClient?.off?.('headersReceive' as any)
      this.httpClient?.off?.('dataReceive' as any)
      this.httpClient?.off?.('dataEnd' as any)
    } catch (_) {}

    try {
      this.httpClient?.destroy()
    } catch (_) {}

    this.httpClient = undefined

    // 清理解析状态
    this.buffer = new Uint8Array(0)
    this.dataBuffer = ''
    this.eventName = undefined

    if (!keepState) this.state = EventSource.CLOSED
  }

  close() {
    this.manuallyClosed = true
    this.setState(EventSource.CLOSED, 'manual close', undefined, true)
    this.cleanup(false)
  }

  /* =======================================================
   * Header 工具：兼容 object / array / key-value
   * ===================================================== */

  private getHeaderValue(headers: any, name: string): string | undefined {
    if (!headers) return undefined
    const target = name.toLowerCase()

    // object: { 'Content-Type': 'text/event-stream' }
    if (typeof headers === 'object' && !Array.isArray(headers)) {
      for (const k of Object.keys(headers)) {
        if (k.toLowerCase() === target) {
          const v = headers[k]
          return typeof v === 'string' ? v : String(v)
        }
      }
    }

    // array: [{...}, ...] 或 ['Content-Type', '...']
    if (Array.isArray(headers)) {
      if (headers.length === 2 && typeof headers[0] === 'string') {
        if ((headers[0] as string).toLowerCase() === target) return String(headers[1] ?? '')
      }
      for (const item of headers) {
        const v = this.getHeaderValue(item, name)
        if (v) return v
      }
    }

    return undefined
  }
}
