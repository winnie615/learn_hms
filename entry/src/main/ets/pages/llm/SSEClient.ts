import http from '@ohos.net.http';

export interface SSEMessage {
  event: string
  data: string
  id?: string
}

export class SSEClient {
  private request = http.createHttp()
  private buffer = ''
  private closed = false

  private lastEventId?: string
  private retryCount = 0
  private readonly maxRetry = 5

  private lastReceiveTime = Date.now()
  private heartbeatTimer?: number
  private seenIds = new Set<string>()

  constructor(
    private url: string,
    private onMessage: (msg: SSEMessage) => void,
    private onError?: (err: Error) => void
  ) {}

  connect() {
    if (this.closed) return

    this.request.request(
      this.url,
      {
        method: http.RequestMethod.GET,
        header: {
          'Accept': 'text/event-stream',
          ...(this.lastEventId ? { 'Last-Event-ID': this.lastEventId } : {})
        },
        readTimeout: 60000
      },
      (err, res) => {
        if (err) {
          this.retry(err)
          return
        }
        this.retryCount = 0
        this.startHeartbeatCheck()
        this.parse(res.result as string)
      }
    )
  }

  private parse(chunk: string) {
    this.lastReceiveTime = Date.now()
    this.buffer += chunk

    const events = this.buffer.split('\n\n')
    this.buffer = events.pop() || ''

    for (const raw of events) {
      const msg: SSEMessage = { event: 'message', data: '' }

      raw.split('\n').forEach(line => {
        if (line.startsWith('event:')) {
          msg.event = line.replace('event:', '').trim()
        } else if (line.startsWith('data:')) {
          msg.data += line.replace('data:', '') + '\n'
        } else if (line.startsWith('id:')) {
          msg.id = line.replace('id:', '').trim()
          this.lastEventId = msg.id
        }
      })

      if (msg.id && this.seenIds.has(msg.id)) continue
      if (msg.id) this.seenIds.add(msg.id)

      if (msg.data.trim()) {
        this.onMessage(msg)
      }
    }
  }

  private startHeartbeatCheck() {
    this.heartbeatTimer && clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastReceiveTime > 30000) {
        this.retry(new Error('heartbeat timeout'))
      }
    }, 10000)
  }

  private retry(err: Error) {
    if (this.retryCount >= this.maxRetry) {
      this.onError?.(err)
      return
    }
    const delay = Math.min(2 ** this.retryCount * 1000, 30000)
    this.retryCount++
    setTimeout(() => this.connect(), delay)
  }

  close() {
    this.closed = true
    this.heartbeatTimer && clearInterval(this.heartbeatTimer)
    this.request.destroy()
  }
}
