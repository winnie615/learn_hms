import { ChatMessage } from '../model/ChatMessage'
import { LLMMessage } from '../model/LLMMessage'
import { SSEClient } from '../llm/SSEClient'
import { StreamController } from '../llm/StreamController'

export class ConversationStore {
  private messages: ChatMessage[] = []
  private currentSSE?: SSEClient
  private controller?: StreamController

  constructor(
    private notify: (messages: ChatMessage[]) => void
  ) {}

  /** 用户发送一条新消息 */
  send(text: string) {
    // 1️⃣ 如果上一轮还在生成 → 直接打断
    this.abortCurrent()

    // 2️⃣ 插入用户消息
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      status: 'done'
    }

    // 3️⃣ 插入 AI 占位消息
    const aiMsg: ChatMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      status: 'loading'
    }

    this.messages.push(userMsg, aiMsg)
    this.notify([...this.messages])

    // 4️⃣ 启动新一轮 LLM
    this.startLLM(aiMsg)
  }

  /** 构建发送给大模型的上下文 */
  private buildContext(maxTurns = 6): LLMMessage[] {
    const history = this.messages
      .filter(m => m.status === 'done')
      .slice(-maxTurns * 2) // user + assistant

    return history.map(m => ({
      role: m.role,
      content: m.content
    }))
  }

  /** 启动 SSE 流式回复 */
  private startLLM(aiMsg: ChatMessage) {
    this.controller = new StreamController((chunk) => {
      aiMsg.content += chunk
      this.notify([...this.messages])
    })

    this.currentSSE = new SSEClient(
      'http://localhost:3000/llm-sse',
      (msg) => {
        if (msg.event === 'message') {
          this.controller?.push(msg.data)
        }
        if (msg.event === 'done') {
          this.finish(aiMsg)
        }
      },
      () => {
        this.error(aiMsg)
      }
    )

    this.currentSSE.connect()
  }

  /** 正常完成 */
  private finish(aiMsg: ChatMessage) {
    this.controller?.forceFlush()
    aiMsg.status = 'done'
    this.cleanup()
    this.notify([...this.messages])
  }

  /** 出错 */
  private error(aiMsg: ChatMessage) {
    aiMsg.status = 'error'
    this.cleanup()
    this.notify([...this.messages])
  }

  /** 用户中断 / 新一轮 */
  abortCurrent() {
    this.currentSSE?.close()
    this.cleanup()
  }

  private cleanup() {
    this.currentSSE = undefined
    this.controller = undefined
  }
}
