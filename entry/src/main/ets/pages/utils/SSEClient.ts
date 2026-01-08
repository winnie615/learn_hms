import http from '@ohos.net.http';

type SSEMessage = {
  event?: string;
  data: string;
  id?: string;
};

export class SSEClient {
  private httpRequest = http.createHttp();
  private buffer = '';
  private retryCount = 0;
  private maxRetry = 5;
  private lastEventId?: string;
  private closed = false;

  constructor(
    private url: string,
    private onMessage: (msg: SSEMessage) => void,
    private onError?: (err: Error) => void
  ) {}

  connect() {
    if (this.closed) return;

    this.httpRequest.request(
      this.url,
      {
        method: http.RequestMethod.GET,
        header: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
          ...(this.lastEventId ? { 'Last-Event-ID': this.lastEventId } : {})
        },
        readTimeout: 60000
      },
      (err, res) => {
        if (err) {
          this.retry(err);
          return;
        }
        this.retryCount = 0;
        this.parse(res.result as string);
      }
    );
  }

  private parse(chunk: string) {
    this.buffer += chunk;
    const blocks = this.buffer.split('\n\n');
    this.buffer = blocks.pop() || '';

    blocks.forEach(block => {
      let event: SSEMessage = { data: '' };
      block.split('\n').forEach(line => {
        if (line.startsWith('data:')) {
          event.data += line.replace('data:', '') + '\n';
        } else if (line.startsWith('event:')) {
          event.event = line.replace('event:', '').trim();
        } else if (line.startsWith('id:')) {
          event.id = line.replace('id:', '').trim();
          this.lastEventId = event.id;
        }
      });

      if (event.data.trim()) {
        this.onMessage(event);
      }
    });
  }

  private retry(err: Error) {
    if (this.retryCount >= this.maxRetry) {
      this.onError?.(err);
      return;
    }
    const delay = Math.pow(2, this.retryCount) * 1000;
    this.retryCount++;
    setTimeout(() => this.connect(), delay);
  }

  close() {
    this.closed = true;
    this.httpRequest.destroy();
  }
}
