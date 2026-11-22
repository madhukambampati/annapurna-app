export interface SmsSender {
  send(to: string, body: string): Promise<void>;
}

export interface SmsNotification {
  to: string;
  body: string;
}

/** Normalize an already-validated NANP phone contact to E.164. Email contacts do not receive SMS. */
export function smsNumber(contact: string): string | null {
  const value = contact.trim();
  if (!value || value.includes("@")) return null;
  let digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

function compactReason(reason: string): string {
  const clean = reason.replace(/\s+/g, " ").trim();
  if (clean.length <= 120) return clean;
  return clean.slice(0, 117).trimEnd() + "...";
}

/** Build the only two external customer notifications Annapurna sends. */
export function orderStatusSms(
  orderId: number,
  status: "ready" | "cancelled",
  contact: string,
  address: string,
  reason = "",
): SmsNotification | null {
  const to = smsNumber(contact);
  if (!to) return null;

  if (status === "ready") {
    return { to, body: `Annapurna Home Foods: Order #${orderId} is ready for pickup at ${address}.` };
  }

  const why = compactReason(reason);
  return {
    to,
    body: why
      ? `Annapurna Home Foods: Order #${orderId} has been cancelled. Reason: ${why}`
      : `Annapurna Home Foods: Order #${orderId} has been cancelled.`,
  };
}

export class TwilioSmsSender implements SmsSender {
  private readonly endpoint: string;

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    if (!accountSid || !authToken) throw new Error("Twilio account SID and auth token are required");
    if (!/^\+\d{8,15}$/.test(fromNumber)) throw new Error("TWILIO_FROM_NUMBER must be in E.164 format, for example +15487080717");
    this.endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  }

  async send(to: string, body: string): Promise<void> {
    const form = new URLSearchParams({ To: to, From: this.fromNumber, Body: body });
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");
    const response = await this.fetchImpl(this.endpoint, {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
    });
    if (!response.ok) {
      const detail = (await response.text()).replace(/\s+/g, " ").trim().slice(0, 300);
      throw new Error(`Twilio SMS failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }
  }
}

/** Collects customer SMS in memory. For tests. */
export class MemorySmsSender implements SmsSender {
  readonly sent: Array<SmsNotification> = [];
  async send(to: string, body: string): Promise<void> {
    this.sent.push({ to, body });
  }
}
