import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { orderStatusSms, smsNumber, TwilioSmsSender } from "../src/sms.js";

describe("customer SMS", () => {
  test("normalizes NANP phone contacts and ignores email contacts", () => {
    assert.equal(smsNumber("(548) 577-4300"), "+15485774300");
    assert.equal(smsNumber("+1 548 577 4300"), "+15485774300");
    assert.equal(smsNumber("customer@example.com"), null);
  });

  test("builds ready and cancellation notifications only for phone contacts", () => {
    const ready = orderStatusSms(25, "ready", "548-577-4300", "1425B Block Line Road, Kitchener");
    assert.deepEqual(ready, {
      to: "+15485774300",
      body: "Annapurna Home Foods: Order #25 is ready for pickup at 1425B Block Line Road, Kitchener.",
    });

    const cancelled = orderStatusSms(26, "cancelled", "548-577-4300", "ignored", "  Item sold out\nfor today  ");
    assert.equal(cancelled?.body, "Annapurna Home Foods: Order #26 has been cancelled. Reason: Item sold out for today");
    assert.equal(orderStatusSms(27, "ready", "customer@example.com", "1425B Block Line Road"), null);
  });

  test("Twilio sender posts an authenticated form to the Messages API", async () => {
    let seenUrl = "";
    let seenInit: RequestInit | undefined;
    const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(input);
      seenInit = init;
      return new Response('{"sid":"SM123"}', { status: 201, headers: { "content-type": "application/json" } });
    }) as typeof fetch;

    const sender = new TwilioSmsSender("AC123", "token-secret", "+15487080717", fakeFetch);
    await sender.send("+15485774300", "Ready & waiting");

    assert.match(seenUrl, /\/Accounts\/AC123\/Messages\.json$/);
    assert.equal(seenInit?.method, "POST");
    const headers = new Headers(seenInit?.headers);
    assert.equal(headers.get("authorization"), "Basic " + Buffer.from("AC123:token-secret").toString("base64"));
    const form = new URLSearchParams(String(seenInit?.body));
    assert.equal(form.get("To"), "+15485774300");
    assert.equal(form.get("From"), "+15487080717");
    assert.equal(form.get("Body"), "Ready & waiting");
  });

  test("Twilio sender surfaces provider failures", async () => {
    const fakeFetch = (async () => new Response('{"code":21610,"message":"blocked"}', { status: 400 })) as typeof fetch;
    const sender = new TwilioSmsSender("AC123", "token-secret", "+15487080717", fakeFetch);
    await assert.rejects(() => sender.send("+15485774300", "Ready"), /Twilio SMS failed with HTTP 400/);
  });
});
