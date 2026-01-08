import { ChatMessage } from '../model/ChatMessage'
import { MarkdownEngine, MdNode } from '../llm/MarkdownEngine'
import { MarkdownView } from './MarkdownView'

@Component
export struct AIBubble {
  @Prop message: ChatMessage
  @State nodes: MdNode[] = []

  private engine = new MarkdownEngine()

  aboutToAppear() {
    this.nodes = this.engine.update(this.message.content)
  }

  aboutToUpdate() {
    this.nodes = this.engine.update(this.message.content)
  }

  build() {
    Column({ space: 8 }) {
      if (this.message.status === 'loading') {
        Text('AI 正在输入...')
          .fontSize(12)
          .fontColor('#888')
      }

      MarkdownView({ nodes: this.nodes })

      if (this.message.status === 'error') {
        Text('生成失败，点击重新生成')
          .fontColor('red')
      }
    }
    .padding(12)
    .backgroundColor('#f0f0f0')
    .borderRadius(8)
  }
}
