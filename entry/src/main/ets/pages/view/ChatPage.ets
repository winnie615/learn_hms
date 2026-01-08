import { ConversationStore } from '../store/ConversationStore'
import { ChatMessage } from '../model/ChatMessage'
import { MessageList } from '../components/MessageList'
import { InputBar } from '../components/InputBar'

@Entry
@Component
struct ChatPage {
  @State messages: ChatMessage[] = []

  private store = new ConversationStore((msgs) => {
    this.messages = msgs
  })

  build() {
    Column() {
      MessageList({ messages: this.messages })

      InputBar({
        onSend: (text: string) => {
          if (text.trim()) {
            this.store.send(text)
          }
        }
      })
    }.height('100%')
  }
}
