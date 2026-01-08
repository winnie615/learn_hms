import { MdNode } from '../llm/MarkdownEngine';
import { CodeBlock } from './CodeBlock';

@Component
export struct MarkdownView {
  @Prop nodes: MdNode[]

  build() {
    Column({ space: 12 }) {
      ForEach(this.nodes, (node: MdNode) => {
        if (node.type === 'heading') {
          Text(node.text)
            .fontSize(30 - node.level * 2)
            .fontWeight(FontWeight.Bold)
        } else if (node.type === 'paragraph') {
          Text(node.text)
            .fontSize(16)
            .lineHeight(24)
        } else if (node.type === 'code') {
          CodeBlock({ text: node.text })
        }
      })
    }.width('100%')
  }
}
