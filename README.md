# Annapurna order agent

Ordering app for Annapurna Authentic Home Foods. Customers open a web page on their phone (it can be added to the home screen), chat to order, and see their orders. The agent builds the order, reads it back, and only places it after a clear yes. Maddy gets an order desk at `/desk` with orders, chats and replies, alerts, a cook list and a buy list.

There is no WhatsApp in this version. The chat runs on your own website. See DEPLOY.md to put it online.

## The idea in one paragraph

Code owns the control flow. TypeSafe (Jev) answers three small typed questions about each customer message. Claude writes the friendly replies and proposes an order draft. Code checks every item, date and price the model proposes, writes the read-back itself, and is the only thing that can place, hold or cancel an order. Every bug we hit in the simulator (wrong dish, wrong weekday, "your order is cancelled" when it wasn't) is now a test.

## Run it

Needs Node 22.5 or newer. No runtime dependencies.

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY, optionally TYPESAFE_API_KEY and OWNER_TOKEN
npm test                    # 132 tests, no network, no keys needed
npm run build
node --env-file=.env --disable-warning=ExperimentalWarning dist/src/index.js
```

Set `OWNER_TOKEN` in `.env` (16+ characters) or the server will not start. Then:

- http://localhost:3000 is what customers see: sign up with name and phone or email, chat, menu, "my orders".
- http://localhost:3000/desk is yours (asks for the token): Orders, Chats (read and reply), Cook and buy, Menu, Rules.
- `SIMULATOR=on` adds a "Test chat" tab to the desk for quick tests without the website.

Without `TYPESAFE_API_KEY` the agent uses simple built-in rules for intent, cancel and yes. It works, but it is less accurate than TypeSafe. Without `ANTHROPIC_API_KEY` the agent replies with a safe "couldn't process that" message.

## What happens on each message

```
customer message
  -> TypeSafe: intent (order / question / owner_topic / smalltalk / other)
               cancels_placed_order (0..1)
               agrees_to_summary (0..1, only asked while a read-back is waiting)
  -> route()   pure function, src/router.ts
       confirm_order   read-back is current and agrees >= 0.90   -> CODE places the order
       confirm_ask     agrees 0.50 to 0.89                        -> "Shall I place it? Reply YES"
       cancel_placed   placed order exists and cancel >= 0.60     -> alert Maddy, fixed reply
       owner_topic     payment / delivery / allergy / refund      -> Claude words it, Maddy alerted
       clarify         intent unsure                              -> Claude asks one question, draft frozen
       normal          everything else                            -> Claude replies and proposes a draft
  -> guards (src/guards.ts) check what Claude proposed
  -> reply. Read-back and order confirmation are written by code, not by the model.
```

## What the code guarantees

| Problem | How it is prevented | Test |
|---|---|---|
| Model says "confirmed" or "cancelled" | The model cannot set the confirmed stage. Orders are placed only by `placeOrder()` after a yes against the current read-back. Cancels only ever create an alert. | `agent.test.ts` |
| Wrong dish (asked Bagara rice and chicken fry, got kheema fry) | Each item carries `asked_for`. Code scores it against menu names and aliases, fixes clear mix-ups, and asks the customer when it is ambiguous. Unknown dishes are never swapped. | `guards.test.ts`, `agent.test.ts` |
| Wrong weekday | The prompt has a calendar table. If the customer names a weekday and the model's date is on another weekday, the pickup is cleared and the customer is asked. | `guards.test.ts`, `agent.test.ts` |
| Weekend combo not running | `live` switch per combo. Switched-off combos never reach the draft, also checked again at the moment of yes. | `agent.test.ts` |
| Double order after a confirmation | Thanks and a stray yes never touch the order, and code refuses to place an order that matches an open one unless the customer asked for another. | `agent.test.ts` |
| Pickup day vs menu | Weekly plans use the plan days, weekend combos use the combo days (Fri to Sun by default), a dish can have its own days (the Sunday special). Prompt, flags and menu labels all read the same rules. | `agent.test.ts`, `web.test.ts` |
| Customer wants a person | Answered by code: one owner alert, a visible "request sent" status in the app, Instagram and phone from the Rules tab. Cleared when you reply. | `agent.test.ts`, `web.test.ts` |
| Price shown vs price charged | Prices come from the menu, never from the model. If a price changes between read-back and yes, the customer sees a fresh read-back first. | `agent.test.ts` |
| Short notice, non-pickup day, missing price | The order is placed on hold with a flag. Maddy accepts or declines. The read-back warns the customer up front. | `guards.test.ts`, `agent.test.ts` |
| A yes from one customer confirming another's order | Drafts, read-backs and locks are per customer. Messages from one customer are processed one at a time. | `agent.test.ts` |
| Webhook retries creating duplicate orders | Provider message ids are de-duplicated. | `agent.test.ts` |
| Server in UTC, kitchen in Toronto | All times are kitchen-timezone wall-clock strings. DST is tested. | `time.test.ts` |

## Owner desk and API

The desk at `/desk` uses these. Set `OWNER_TOKEN` and send `Authorization: Bearer <token>`.

| Endpoint | Purpose |
|---|---|
| `GET /api/state` | orders, alerts, menu, settings, recent chats |
| `GET /api/customers/:id/messages` | one customer's chat |
| `POST /api/customers/:id/reply` | `{text}`: your reply appears in the customer's chat |
| `POST /api/orders/:id/status` | `{status}`: hold to cook or cancelled, cook to ready or cancelled, ready to done or cook. Accept, cancel and ready also post a note in the customer's chat. |
| `POST /api/alerts/:id/done` | dismiss an alert |
| `PATCH /api/menu/:id` | `{single, bogo, plan, live, verify, desc, recipe, aliases}` |
| `PUT /api/settings` | `{noticeHrs, address, days, notes}` |
| `GET /api/cook?date=YYYY-MM-DD` | cook list per pickup day and a buy list |

Buy list amounts come from each dish's `recipe` (one line per ingredient, `Chicken | 250 | g`, per meal or per person per week for plans). No recipes are set yet, so the buy list is empty until you add them.

## Alerts to your phone

Set `NOTIFY_URL=https://ntfy.sh/<secret-topic>` and install the ntfy app. New orders, held orders, cancel requests and "needs Maddy" flags are pushed there. Without it they are only logged.

## The customer website

- **No account or password.** A customer gives a name, a phone or email, and ticks a consent box. The server hands back a random token, kept in that phone's browser and stored on the server only as a hash. Lose the phone or clear the browser and they start a new chat (their placed orders still reach you).
- **Isolation.** Every call is tied to the token's own customer. There is no way to name another customer's id.
- **Limits.** 6 new chats per IP per hour, 12 messages per minute and 80 per day per customer, 1500 per day for everyone (`WEB_*` in `.env.example`). Wrong owner tokens lock that IP out for 15 minutes after 10 tries. Request bodies over 100 KB are refused.
- **Hardening.** Strict Content-Security-Policy with no inline scripts, fixed list of files that can be served, no cookies (so no CSRF), all text rendered as text.
- **Your replies.** What you type in Chats, and the notes sent when you accept, cancel or mark ready, show up in the customer's chat within about 7 seconds. There are no push notifications to customers yet, they see updates when they open the app.
- **Delete my chat.** Removes messages, draft and login. Placed orders stay so you can cook them.

## Not built yet

- **WhatsApp.** The seam is still `agent.handle({ from, name, text, messageId })`, so an adapter can be added later without touching the agent. Meta rules on numbers and AI bots are worth re-checking before you do.
- **Push notifications to customers, online payment, delivery.** The agent tells customers Maddy will confirm payment and delivery.

## Things you should know

- **TypeSafe wiring is written from the docs and is untested against the live API.** The request and response shapes follow docs.typesafe.ai, and the code is tested against stubs of those shapes. First real run: look for `TypeSafe failed` in the server log. With `SIMULATOR=on` the Test chat tab also shows the route under each reply.
- **Thresholds are starting guesses.** `TH_*` values in `.env` control when a yes is trusted, when a cancel is trusted, and so on. Tune them after watching real messages. TypeSafe's own docs list weak spots (literal reading, dates, counting), which is why dates and totals are done in code and not asked of it.
- **Telugu and Tenglish accuracy is unknown.** Code-written messages (read-back, confirmation, cancel notice) are in English. Item checking is skipped for Telugu script because it cannot be matched to English names.
- **The default Claude model id is `claude-sonnet-5`.** Change `CLAUDE_MODEL` if you want a different one.
- **`node:sqlite` is marked experimental in Node 22.** It is why there are no native dependencies. The `--disable-warning` flag hides the notice.
- **Menu data is the Instagram reading.** Items marked "check price" in the console need your OK. Bagara Rice and Chicken Fry and Gongura Chicken Kheema Pulao have no price set, so orders for them go on hold.
- **Not deployed anywhere, and the Dockerfile has not been built** (no Docker daemon where this was written). See DEPLOY.md. The server refuses to start without `OWNER_TOKEN`.

## Layout

```
src/agent.ts     turn loop, read-back, placing orders, alerts
src/router.ts    pure routing from TypeSafe judgments
src/judge.ts     TypeSafe client, rules fallback
src/guards.ts    item matching, draft checks, flags, weekday check
src/llm.ts       Claude client
src/prompt.ts    the prompt and the agent rules
src/store.ts     SQLite
src/cook.ts      cook list and buy list
src/server.ts    HTTP: customer site API, owner API, static files, limits
src/limiter.ts  in-memory rate limiter
src/menu.ts      default menu and settings
public/index.html, app.js   customer page (installable web app)
public/desk.html, desk.js   owner desk
Dockerfile, DEPLOY.md       hosting
test/            132 tests
```
