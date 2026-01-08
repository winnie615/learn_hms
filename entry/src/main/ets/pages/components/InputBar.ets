import { Prop, State, Component, Event } from '@ohos/ui-ets'

@Component
export struct InputBar {
  // 用户点击发送回调
  @Prop onSend: (text: string) => void

  // 是否锁定输入（AI生成中）
  @Prop disabled: boolean = false

  @State private text: string = ''

  build() {
    // Row({ justifyContent: JustifyContent.SpaceBetween, alignItems: Alignment.Center }) {
    Row() {
      // 多行输入框
      TextArea({
        // value: this.text,
        placeholder: '输入消息...',
        // onChange: (value: string) => {
        //   this.text = value
        // },
        // editable: !this.disabled,
        // maxLines: 4,
        // height: 48,
        // width: '80%',
        // fontSize: 16,
        // padding: { left: 12, right: 12 }
      })

      // 发送按钮
      Button({
        text: '发送',
        onClick: () => {
          const trimmed = this.text.trim()
          if (trimmed) {
            this.onSend(trimmed)
            this.text = ''
          }
        },
        disabled: this.disabled || !this.text.trim()
      }).width(60).height(40)
    }
    .padding(8)
    .backgroundColor('#f7f7f7')
    .borderRadius(20)
    .width('100%')
  }
}
