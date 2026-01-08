@Component
export struct CodeBlock {
  @Prop text: string

  build() {
    Scroll() {
      Text(this.text)
        .fontFamily('monospace')
        .fontSize(14)
        .padding(12)
        .backgroundColor('#f5f5f5')
    }
  }
}
