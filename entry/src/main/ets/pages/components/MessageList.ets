import { ChatMessage } from '../model/ChatMessage'
import { AIBubble } from './AIBubble'
import { UserBubble } from './UserBubble'

@Component
export struct MessageList {
  @Prop messages: ChatMessage[]

  build() {
    Scroll() {
      Column({ space: 12 }) {
        ForEach(this.messages, (msg: ChatMessage) => {
          if (msg.role === 'user') {
            UserBubble({ message: msg })
          } else {
            AIBubble({ message: msg })
          }
        })
      }.padding(12)
    }
  }
}
