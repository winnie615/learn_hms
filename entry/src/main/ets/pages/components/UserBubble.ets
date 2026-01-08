import { ChatMessage } from '../model/ChatMessage'

@Component
export struct UserBubble {
  @Prop message: ChatMessage

  build() {
    // 整体右对齐，用户气泡靠右
    // Row({ justifyContent: JustifyContent.End }) {
    Row() {
      Column({ space: 4 }) {
        Text(this.message.content)
          .fontSize(16)
          .lineHeight(24)
          .fontColor('#fff')
          .padding({ top: 8, bottom: 8, left: 12, right: 12 })
          .backgroundColor('#007AFF') // 蓝色气泡
          .borderRadius(16)
          // .maxWidth('70%') // 限制宽度
          .flexShrink(1)   // 防止气泡撑出屏幕

        if (this.message.status === 'error') {
          Text('发送失败')
            .fontSize(12)
            .fontColor('#FF3B30')
            // .alignSelf(FlexAlign.End)
        }
      }
    }.width('100%')
  }
}
