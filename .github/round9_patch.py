from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f"already fixed: {label}")
        return text
    if old not in text:
        raise SystemExit(f"expected code not found: {label}")
    print(f"fixed: {label}")
    return text.replace(old, new, 1)


app_path = Path("public/app.js")
app = app_path.read_text()
old_resume = '''      }).catch(function (e2) {
        token = "";
        if (e2.status === 401 || e2.status === 409) {
          store(RESUME_TOKEN_KEY, null);
          return fresh();
        }
        throw e2;
      });'''
new_resume = '''      }).catch(function (e2) {
        token = "";
        // A returning customer's saved-session failure must never silently become a new chat.
        // In particular, a contact typo (409) must keep the resume token so the customer can
        // correct the contact and try again without being subject to the new-chat IP quota.
        if (e2.status === 409) {
          var mismatch = new Error("This device has a saved chat for a different contact. Enter the same phone number or email used for that chat.");
          mismatch.status = 409;
          throw mismatch;
        }
        // An expired/deleted token is genuinely no longer resumable. Clear only that unusable
        // token, explain what happened, and require a second explicit submit to create a new chat.
        // This keeps the anti-abuse new-chat limit scoped to intentional new sessions.
        if (e2.status === 401) {
          store(RESUME_TOKEN_KEY, null);
          var expired = new Error("Your saved chat is no longer available. Submit again if you'd like to start a new chat.");
          expired.status = 401;
          throw expired;
        }
        throw e2;
      });'''
app = replace_once(app, old_resume, new_resume, "do not silently fall back from resume to new session")
app_path.write_text(app)


test_path = Path("test/web.test.ts")
test = test_path.read_text()
anchor = '''  test("new chats per IP per hour", () =>
    withRig(async ({ call, advance }) => {
      const body = { name: "A", contact: "5195550101", consent: true };
      for (let i = 0; i < 2; i++) assert.equal((await call("POST", "/web/session", { body })).status, 200);
      const blocked = await call("POST", "/web/session", { body });
      assert.equal(blocked.status, 429);
      assert.ok(Number(blocked.headers.get("retry-after")) > 0);
      advance(3_600_001);
      assert.equal((await call("POST", "/web/session", { body })).status, 200);
    }, { web: { sessionsPerIpHour: 2 } }));
'''
addition = anchor + '''
  test("returning customer resume bypasses an exhausted new-chat IP quota", () =>
    withRig(async ({ call }) => {
      const existing = { name: "Returning User", contact: "returning@example.com", consent: true };
      const created = await call("POST", "/web/session", { body: existing });
      assert.equal(created.status, 200);
      const token = created.json.token as string;

      // The only allowed new chat from this network has now been consumed.
      const blocked = await call("POST", "/web/session", { body: { name: "New User", contact: "new@example.com", consent: true } });
      assert.equal(blocked.status, 429);

      // Resuming the already-authenticated saved chat is not a new session and must still work.
      const resumed = await call("POST", "/web/resume", { token, body: existing });
      assert.equal(resumed.status, 200);
      assert.equal((await call("GET", "/web/orders", { token })).status, 200);
    }, { web: { sessionsPerIpHour: 1 } }));

  test("wrong contact on resume does not invalidate the existing saved session", () =>
    withRig(async ({ call }) => {
      const existing = { name: "Returning User", contact: "returning@example.com", consent: true };
      const created = await call("POST", "/web/session", { body: existing });
      const token = created.json.token as string;

      const wrong = await call("POST", "/web/resume", {
        token,
        body: { name: "Returning User", contact: "wrong@example.com", consent: true },
      });
      assert.equal(wrong.status, 409);

      // The same token is still valid; correcting the contact resumes the original customer.
      const corrected = await call("POST", "/web/resume", { token, body: existing });
      assert.equal(corrected.status, 200);
      assert.equal((await call("GET", "/web/history", { token })).status, 200);
    }, { web: { sessionsPerIpHour: 1 } }));
'''
test = replace_once(test, anchor, addition, "resume bypasses new-chat quota regressions")
test_path.write_text(test)

print("Round 9 resume/rate-limit patch prepared.")
