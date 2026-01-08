export class MarkdownStreamManager {
  private fullText = '';
  private queue: string[] = [];
  private timer?: number;

  constructor(
    private onUpdate: (text: string) => void,
    private speed = 20 // ms / char
  ) {}

  push(markdownChunk: string) {
    this.queue.push(...markdownChunk.split(''));
    this.start();
  }

  private start() {
    if (this.timer) return;

    this.timer = setInterval(() => {
      const char = this.queue.shift();
      if (!char) {
        clearInterval(this.timer);
        this.timer = undefined;
        return;
      }
      this.fullText += char;
      this.onUpdate(this.fullText);
    }, this.speed);
  }

  reset() {
    this.fullText = '';
    this.queue = [];
  }
}
