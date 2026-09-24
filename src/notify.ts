/** Tells Maddy something needs her. Swap in WhatsApp-to-owner, Telegram, etc. later. */
export interface Notifier {
  notify(title: string, text: string): Promise<void>;
}

export class ConsoleNotifier implements Notifier {
  async notify(title: string, text: string): Promise<void> {
    console.log(`[owner] ${title}: ${text}`);
  }
}

/**
 * POSTs the text as the body with a Title header. This is the ntfy.sh format:
 * NOTIFY_URL=https://ntfy.sh/your-secret-topic, then install the ntfy phone app.
 */
export class WebhookNotifier implements Notifier {
  constructor(private readonly url: string, private readonly fetchImpl: typeof fetch = fetch) {}
  async notify(title: string, text: string): Promise<void> {
    try {
      await this.fetchImpl(this.url, { method: "POST", headers: { Title: title }, body: text });
    } catch (e) {
      console.error("notify failed", e);
    }
  }
}

/** Collects notifications in memory. For tests. */
export class MemoryNotifier implements Notifier {
  readonly sent: Array<{ title: string; text: string }> = [];
  async notify(title: string, text: string): Promise<void> {
    this.sent.push({ title, text });
  }
}
