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

type SSEEventMap = {
  open: void
  message: SSEMessage
  error: string
  done: void
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

  constructor(
    private url: string,
    private heartbeatTimeout = 30000,
    private autoCloseOnDone = true,
    private headers?: Record<string, string>
  ) {
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

  /* =======================================================
   * 建立连接
   * ===================================================== */

  private connect() {
    if (this.state === EventSource.CLOSED) return

    this.state = EventSource.CONNECTING
    this.httpClient = http.createHttp()

    this.startHeartbeat()

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
      },
      (err) => {
        if (err) {
          this.handleError(err.message)
          return
        }
        this.retryCount = 0
        this.state = EventSource.OPEN
        this.emit('open', undefined)
      }
    )

    this.httpClient.on('dataReceive', (chunk: ArrayBuffer) => {
      this.lastReceiveTime = Date.now()
      this.parseChunk(new Uint8Array(chunk))
    })
  }

  /* =======================================================
   * 心跳检测
   * ===================================================== */

  private startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
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
    return util.TextDecoder.create('utf-8').decodeToString(bytes)
  }

  /* =======================================================
   * 数据解析
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

    if (!line) {
      if (!this.dataBuffer) return

      const data = this.dataBuffer.trimEnd()
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
    const value = colonIndex > -1 ? line.slice(colonIndex + 1).trim() : ''

    if (field === 'data') this.dataBuffer += value + '\n'
    else if (field === 'id') this.lastEventId = value
    else if (field === 'retry') this.retryInterval = Number(value) || DEFAULT_RETRY
    else if (field === 'event') this.eventName = value
  }

  /* =======================================================
   * 错误处理 & 重连
   * ===================================================== */

  private handleError(reason: string) {
    if (this.state === EventSource.CLOSED) return

    this.emit('error', reason)
    this.close()

    if (++this.retryCount > MAX_RETRY) return

    const delay = Math.min(
      this.retryInterval * Math.pow(2, this.retryCount - 1),
      30000
    )
    setTimeout(() => this.connect(), delay)
  }

  close() {
    this.state = EventSource.CLOSED
    this.stopHeartbeat()
    this.httpClient?.destroy()
  }
}
