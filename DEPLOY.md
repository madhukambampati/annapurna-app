# Putting Annapurna online

Prices below were read from each company's own pricing page on 2026-09-24. They change, so check again before you pay.

## What the host must give you

- Runs a Docker image (or Node 22.5+).
- A **persistent disk** mounted at `/data`. Orders, chats and menu edits live in one SQLite file there. Without a disk, every restart wipes them.
- **HTTPS** on your own address (all mainstream hosts do this for you). Needed for "Add to Home Screen" and because customers type names and phone numbers.
- **One instance only.** SQLite and the in-memory rate limiter assume a single running copy. Do not scale to two.

## Which host

| Host | What it costs (from their pages) | Notes |
|---|---|---|
| **Fly.io** (recommended) | Always-on 512 MB machine about $3.31/month, volume $0.15/GB/month, base prices in Ashburn | Cheapest that fits. Command line tool. Extras such as a dedicated IP address and bandwidth I did not check. |
| Railway | Hobby plan $5/month with $5 of usage included, 5 GB volume. Free plan has only 0.5 GB RAM and a 0.5 GB volume | Easier website, but usage billing is harder to predict. |
| Render | Cheapest always-on service $7/month (512 MB), disk $0.25/GB/month. Free services do not get a disk | Simple, more expensive. |

Any small VPS with Docker also works.

## Deploy on Fly.io, step by step

I could not run these commands for you: creating the account and adding a payment method must be done by you. I have not run flyctl myself, so if a prompt looks different, follow what it says and tell me.

1. Sign up at fly.io and install their command line tool (fly.io/docs/flyctl/install). Then `fly auth login`.
2. Unzip the project. Open `fly.toml` and change `app = "annapurna-CHANGE-ME"` to a name nobody else has, for example `annapurna-maddy-kw`.
3. Create the app and its disk:
   ```bash
   fly apps create annapurna-maddy-kw
   fly volumes create annapurna_data --size 1 --region iad
   ```
4. Store your secrets (they are not written in any file):
   ```bash
   fly secrets set OWNER_TOKEN="$(openssl rand -hex 24)" ANTHROPIC_API_KEY=sk-... TYPESAFE_API_KEY=...
   ```
   Save the OWNER_TOKEN somewhere (password manager). You need it to open `/desk`. Leave out TYPESAFE_API_KEY if you do not have one.
5. Deploy, then keep exactly one machine (SQLite needs one):
   ```bash
   fly deploy
   fly scale count 1
   ```
6. Open `https://annapurna-maddy-kw.fly.dev/health`. It should say `{"ok":true}`.
7. Open `/desk`, paste the token, go to the **Rules** tab and read "Rate-limit check". It shows the address the server thinks you have. Compare with your real public IP (search "what is my IP"). If it shows something else, change `PROXY_HOPS` in `fly.toml` (2 or 1) and run `fly deploy` again. Do not skip this: a wrong value makes all customers share one limit.
8. On your phone open the app address, add it to the home screen, place a test order, accept it in `/desk`.

Later: `fly logs` shows errors, `fly deploy` ships an update, and the disk keeps your data between deploys.

## Settings (environment variables)

| Variable | Value |
|---|---|
| `OWNER_TOKEN` | Long random string, 16+ characters (`openssl rand -hex 24`). This is your password for `/desk`. The server will not start without it. |
| `ANTHROPIC_API_KEY` | Your Claude key. Set a monthly spend limit in the Anthropic console too. |
| `TYPESAFE_API_KEY` | Optional. Without it, built-in rules judge intent, cancel and yes. |
| `PROXY_HOPS` | Number of proxies in front. Fly: start with `2` and check the desk's Rules tab (Fly's docs say the last X-Forwarded-For entry is your app's own address). Other hosts: usually `1`, check the same way. Wrong value = all customers share one limit. |
| `DB_PATH` | `/data/annapurna.db` (already the default in the Docker image). |
| `NOTIFY_URL` | `https://ntfy.sh/<your-secret-topic>` and install the ntfy app, so new orders and "needs Maddy" alerts reach your phone. |
| `SIMULATOR` | Leave unset. It has no login. |

## Build and run with Docker

```bash
docker build -t annapurna .
docker run -d --name annapurna -p 3000:3000 \
  -v annapurna-data:/data \
  -e OWNER_TOKEN=... -e ANTHROPIC_API_KEY=... -e TYPESAFE_API_KEY=... \
  -e PROXY_HOPS=1 annapurna
```

The Dockerfile was written but **not built here** (no Docker daemon in my sandbox). The same layout was run with plain Node and passed. If the build fails, send me the error.

## First-day checklist

1. Open `https://your-address/health`. You should see `{"ok":true}`.
2. Open `https://your-address/desk`, paste your `OWNER_TOKEN` when asked.
3. **Menu tab**: fill in the prices that say "check price" (Bagara Rice and Chicken Fry, Gongura Kheema Pulao have none, so orders for them go on hold). Add ingredients per dish if you want the buy list.
4. **Rules tab**: check notice hours, pickup days, address, menu notes.
5. On your phone, open the customer address, start a chat with your own name, place a test order, then accept it in `/desk`. Check that your reply and "ready for pickup" show up in the customer chat.
6. Check the server log for `TypeSafe failed` or `model turn failed` lines. Those mean a wrong key or no credits.
7. Then share the link (Instagram bio, WhatsApp status, a QR code on your packaging).

## Cost guard-rails already in the code

Per customer: 8 messages a minute and 80 a day. Per IP: 6 new chats an hour. Everyone together: 1500 messages a day, then customers see "very busy, try later". Change with the `WEB_*` variables in `.env.example`. Multiply the daily cap by the per-message price of your Claude model to see the worst case in a day.

## Backups

Everything is one file, `annapurna.db` (plus `-wal` and `-shm` beside it while running). Take copies regularly with your host's volume snapshot feature, or:

```bash
docker exec annapurna node --disable-warning=ExperimentalWarning -e "const {DatabaseSync}=require('node:sqlite');new DatabaseSync('/data/annapurna.db').exec(\"VACUUM INTO '/data/backup.db'\")"
docker cp annapurna:/data/backup.db ./backup-$(date +%F).db
```

## Privacy

Customers give a name and a phone or email, and their chat text is sent to Anthropic (and TypeSafe, if enabled) to produce replies. The sign-up form says so and asks for a tick. "Delete my chat" in the app removes their messages and login but keeps placed orders so you can cook them. Put a short privacy line on your Instagram or page saying what you keep and why. I am not a lawyer: if you want to check what Ontario and Canadian privacy law expects of a small food business, ask one.

## Updating (git, no re-downloading the whole project)

The project folder is a git repository. Deploying an update is: get the changes into the folder, commit, `fly deploy`. Your data (orders, chats), secrets and disk stay as they are.

**One time, put it on GitHub (your account, I cannot do this for you):**

1. On github.com create a new **private** repository, empty (no README). Never make it public: it is your business code.
2. In the project folder:
   ```bash
   git status                      # if fly.toml shows as modified, that is your app name: keep it
   git add -A && git commit -m "my fly app name"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
   `.env` and `*.db` are in `.gitignore`, so keys and data are never pushed. Check `git status` shows nothing secret before pushing.

**Each update:**

- If I send a patch file (`update-1.patch`), then in the project folder:
  ```bash
  git apply --index ~/Downloads/update-1.patch
  git commit -m "update 1"
  git push          # if you use GitHub
  fly deploy
  ```
  If `git apply` complains, do not force it: tell me the message.
- If the changes are already on GitHub (for example from a Claude Code session connected to your repo), it is just:
  ```bash
  git pull
  fly deploy
  ```

Check what changed any time with `git log --stat -3`. To go back to an earlier version: `git revert <commit>` then `fly deploy`.

Later, if you want deploys to happen automatically on every push, Fly can do that from GitHub Actions. Ask me and I will set it up and check the current Fly steps first.
