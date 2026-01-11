import web_webview from '@ohos.web.webview'
import EventSource from './EventSource' // 你的 SSE 实现
import { RenderThrottler } from './RenderThrottler'
import { TokenFlushInfo, TokenTyper } from './TokenTyper'

@Entry
@Component
struct StreamMarkdownWeb {
  private controller: web_webview.WebviewController = new web_webview.WebviewController()

  @State status: string = '加载中…'
  private webReady: boolean = false

  private es?: EventSource

  private render = new RenderThrottler({
    intervalMs: 80,
    onRender: (fullText: string) => {
      if (!this.webReady) return
      const js = `window.updateMarkdown(${toJsString(fullText)});`
      try {
        this.controller.runJavaScript(js) // runJavaScript 异步执行脚本 :contentReference[oaicite:3]{index=3}
      } catch (e) {}
    }
  })

  private typer = new TokenTyper({
    flushIntervalMs: 33,
    maxTokensPerFlush: 8,
    maxCharsPerFlush: 80,
    onFlush: (info: TokenFlushInfo) => {
      this.render.push(info.fullText)
    }
  })

  aboutToAppear() {
    this.status = '加载 Web…'
  }

  aboutToDisappear() {
    this.es?.close()
    this.typer.stop()
    this.render.stop()
  }

  private startSSE() {
    if (this.es) return

    this.status = '连接 SSE…'
    this.es = new EventSource('https://your-sse-url')

    this.es.on('open', () => {
      this.status = '生成中…'
      this.typer.start()
    })

    this.es.on('message', (msg) => {
      this.typer.enqueueChunk(msg.data)
    })

    this.es.on('statechange', (s) => {
      if (s.state === EventSource.OPEN) {
        this.status = '生成中…'
        this.typer.resume()
      } else if (s.state === EventSource.CONNECTING) {
        this.status = `重连中…(${s.retryCount})`
        this.typer.pause()
      } else {
        this.status = '已关闭'
        this.typer.pause()
      }
    })

    this.es.on('done', () => {
      this.status = '完成'
      this.typer.flushNow()
      this.render.flushNow()
      this.typer.stop()
      this.es?.close()
    })

    this.es.on('error', (msg) => {
      this.status = `错误：${msg}`
    })
  }

  build() {
    Column() {
      Text(this.status).margin({ bottom: 8 })

      Web({ src: $rawfile('sse_md.html'), controller: this.controller })
        .onControllerAttached(() => {
          // 如果你必须用 loadUrl 动态加载，也可以：
          // this.controller.loadUrl($rawfile('sse_md.html'))  :contentReference[oaicite:4]{index=4}
        })
        .onPageEnd(() => {
          this.webReady = true
          this.status = 'Web 已就绪'
          // 可先清屏一次
          this.controller.runJavaScript(`window.updateMarkdown("")`)
          this.startSSE()
        })
        .height('90%')
    }.padding(12)
  }
}

function toJsString(str: string): string {
  return JSON.stringify(str)
}
