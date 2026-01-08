一、生产级总体目标（先定标准）

你的系统在生产中必须满足：

✅ 网络不稳定也能用
✅ SSE 不会假死 / 重复 / 丢消息
✅ 大 Markdown 不会卡 UI / OOM
✅ 流式 + 打字机效果可控
✅ UI 不频繁全量重建
✅ 任何一层挂了都能恢复

二、生产级最终架构（补强版）
┌──────────────┐
│   SSE Server │
│ - id         │
│ - ping       │
│ - retry      │
└──────┬───────┘
│
▼
┌────────────────────────┐
│ SSEClient (Network)    │
│ - Last-Event-ID        │
│ - 心跳超时             │
│ - 指数退避重连         │
│ - 去重                 │
└──────┬─────────────────┘
│ markdown chunk
▼
┌────────────────────────┐
│ StreamController       │
│ - chunk 合并            │
│ - token / char 模式    │
│ - 背压                 │
└──────┬─────────────────┘
│ throttled text
▼
┌────────────────────────┐
│ MarkdownEngine         │
│ - 增量解析             │
│ - AST Cache            │
│ - 容错解析             │
└──────┬─────────────────┘
│ AST diff
▼
┌────────────────────────┐
│ ArkUI Renderer         │
│ - 分块渲染             │
│ - 虚拟滚动             │
│ - CodeBlock 组件化     │
└────────────────────────┘


三、SSEClient（生产级网络层）
1️⃣ 必须支持的能力
| 能力            | 是否必须 | 原因    |
| ------------- | ---- | ----- |
| Last-Event-ID | ✅    | 防止重复  |
| 心跳超时          | ✅    | 防止假连接 |
| 指数退避          | ✅    | 防止雪崩  |
| 消息去重          | ✅    | 重连常见  |
| close 可控      | ✅    | 页面切换  |

2️⃣ 关键生产级改造点
🔴 心跳超时检测（非常关键）

private heartbeatTimer?: number
private lastReceiveTime = Date.now()

private startHeartbeatCheck() {
this.heartbeatTimer = setInterval(() => {
if (Date.now() - this.lastReceiveTime > 30000) {
this.reconnect(new Error('heartbeat timeout'))
}
}, 10000)
}

🔴 消息去重（避免 UI 重复渲染）

private seenIds = new Set<string>()

if (event.id) {
if (this.seenIds.has(event.id)) return
this.seenIds.add(event.id)
}

🔴 重连策略（生产推荐）
delay = min(2^retry * 1000, 30000)

并且：

前台页面才重连

后台直接断开

四、StreamController（流控 + 背压）

这是你之前 MarkdownStreamManager 的生产升级版

1️⃣ 为什么要升级？

原版问题：

SSE 快 → queue 无限长

UI 跟不上 → OOM 风险

2️⃣ 生产级设计原则

SSE 推得快 → 合并

UI 忙 → 丢弃低优先级

字符 & token 双模式

3️⃣ 核心实现（精简版）

```ts
class StreamController {
  private buffer = ''
  private lastFlush = 0

  constructor(
    private onFlush: (text: string) => void,
    private interval = 50
  ) {}

  push(chunk: string) {
    this.buffer += chunk
    const now = Date.now()

    if (now - this.lastFlush > this.interval) {
      this.flush()
    }
  }

  private flush() {
    if (!this.buffer) return
    this.onFlush(this.buffer)
    this.buffer = ''
    this.lastFlush = Date.now()
  }

  forceFlush() {
    this.flush()
  }
}

```
📌 生产要点

不再“每个字符 setInterval”

改成 时间片驱动

UI 刷新频率可控

五、MarkdownEngine（生产级解析层）
1️⃣ 生产中不能每次全量 parse
问题

Markdown 1w 行

每次字符更新 → 全量 split → 卡死

2️⃣ 生产级策略
✅ 行级增量解析

```ts
class MarkdownEngine {
  private lines: string[] = []
  private nodes: MdNode[] = []

  update(fullText: string): MdNode[] {
    const newLines = fullText.split('\n')

    for (let i = this.lines.length; i < newLines.length; i++) {
      this.nodes.push(parseLine(newLines[i]))
    }

    this.lines = newLines
    return this.nodes
  }
}

```

CodeBlock 状态机（生产必备）

```ts
let inCode = false

if (line.startsWith('```')) {
  inCode = !inCode
}

```

👉 不要依赖正则一次性匹配

3️⃣ 容错解析（AI 输出必备）

** 不成对 → 原样显示

半行 markdown → 不 throw

六、ArkUI Renderer（UI 层生产优化）
1️⃣ 分块渲染（避免 Column 太大）

```ts
ForEach(nodes.slice(visibleStart, visibleEnd))

```
或：
LazyForEach

2️⃣ CodeBlock 必须组件化

```ts
@Component
struct CodeBlock {
  text: string

  build() {
    Scroll() {
      Text(this.text)
        .fontFamily('monospace')
    }
  }
}

```
3️⃣ 滚动跟随（ChatGPT 体验）

if (autoScroll) {
scroller.scrollToEnd()
}

七、生产级“完整调用链”
SSE chunk
↓ (去重 / 心跳)
SSEClient.onMessage
↓
StreamController.push
↓ (节流)
MarkdownEngine.update
↓ (增量 AST)
@State nodes
↓
LazyForEach 渲染

八、生产必做 Checklist（直接照着打勾）

SSE 心跳超时

Last-Event-ID

去重

背压

增量解析

Lazy 渲染

页面可中断

大文本不卡顿