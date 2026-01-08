import { MdNode } from './MarkdownParser';

@Component
export struct MarkdownView {
  nodes: MdNode[]|null = null;

  build() {
    Column({ space: 12 }) {
      ForEach(this.nodes, (node: MdNode) => {
        if (node.type === 'heading') {
          Text(node.text)
            .fontSize(28 - node.level * 2)
            .fontWeight(FontWeight.Bold)
        } else if (node.type === 'paragraph') {
          Text(node.text)
            .fontSize(16)
            .lineHeight(24)
        } else if (node.type === 'code') {
          Text(node.text)
            .fontFamily('monospace')
            .backgroundColor('#f5f5f5')
            .padding(12)
        }
      })
    }.width('100%')
  }
}
