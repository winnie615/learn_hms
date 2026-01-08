import { MdNode, parseMarkdown } from "./MarkdownParser";
import { MarkdownStreamManager } from "./MarkdownStreamManager";
import { MarkdownView } from "./MarkdownView";
import { SSEClient } from "./SSEClient";

@Component
export  struct SSEMarkdownPage {
  @State markdown: string = '';
  @State nodes:MdNode[]= [];

  private streamMgr = new MarkdownStreamManager((text) => {
    this.markdown = text;
    this.nodes = parseMarkdown(text);
  });

  private sse = new SSEClient(
    'https://your-sse-server',
    (msg) => {
      this.streamMgr.push(msg.data);
    },
    (err) => {
      console.error('SSE failed', err);
    }
  );

  aboutToAppear() {
    this.sse.connect();
  }

  aboutToDisappear() {
    this.sse.close();
  }

  build() {
    Scroll() {
      MarkdownView({ nodes: this.nodes })
    }
  }
}
