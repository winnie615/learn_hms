export type MdNode =
  | { type: 'heading'; level: number; text: string }
    | { type: 'paragraph'; text: string }
    | { type: 'code'; text: string }

export class MarkdownEngine {
  private lines: string[] = []
  private nodes: MdNode[] = []
  private inCode = false
  private codeBuffer: string[] = []

  update(fullText: string): MdNode[] {
    const newLines = fullText.split('\n')

    for (let i = this.lines.length; i < newLines.length; i++) {
      this.parseLine(newLines[i])
    }

    this.lines = newLines
    return this.nodes
  }

  private parseLine(line: string) {
    if (line.startsWith('```')) {
      this.inCode = !this.inCode
      if (!this.inCode) {
        this.nodes.push({
          type: 'code',
          text: this.codeBuffer.join('\n')
        })
        this.codeBuffer = []
      }
      return
    }

    if (this.inCode) {
      this.codeBuffer.push(line)
      return
    }

    if (line.startsWith('#')) {
      const level = line.match(/^#+/)?.[0].length || 1
      this.nodes.push({
        type: 'heading',
        level,
        text: line.replace(/^#+\s*/, '')
      })
    } else if (line.trim()) {
      this.nodes.push({
        type: 'paragraph',
        text: line
      })
    }
  }
}
