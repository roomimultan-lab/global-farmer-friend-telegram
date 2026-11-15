# Global Farmer Friend — Telegram Bot Server

Free Telegram bot backend for **Global Farmer Friend**
(@GlobalFarmerFriendBot — https://t.me/GlobalFarmerFriendBot).

Totally free: no paid APIs, no paid service. Telegram Bot API only.
No LLM / vision key. Answers are keyword-based, in the farmer's
saved language where a translation exists, otherwise in English.

> **Never paste the bot token in chat, in a screenshot, or in
> any file in this folder.** The owner pastes it himself in
> Railway (Variables tab). This code reads it from the
> environment only, and never logs it.

## What it does

- `POST /telegram` — Telegram webhook. Logs `Incoming from <chat_id>`.
- `/start` flow: name → country (19 launch countries) → crop → language → saved to `db.json` with `chat_id`, country, crop, language.
- After registration, a farmer types any farming question and gets a short helpful answer (sowing, fertilizer, irrigation, pest/disease, weather, market price) — with a dose example, safety / waiting-period note, and "confirm with your local agriculture officer".
- Leaf photo: logged, and the bot replies that a photo alone is not a final diagnosis, asks for crop / affected part / when it started, and gives general advice. It does **not** claim a diagnosis it cannot make.
- `POST /admin/send-alert` — broadcast to all saved farmers, optionally filtered by `country`, `crop` or `language`.
- `GET /health` — `{"ok":true,"service":"global-farmer-friend-telegram","mode":"live"|"mock","farmers":N}`
- `GET /admin/farmers` — list saved farmers (needs `ADMIN_KEY`).

19 launch countries: Pakistan, India, Bangladesh, China, Indonesia,
Vietnam, Thailand, Philippines, Nigeria, Kenya, Ethiopia, Egypt,
Türkiye, Ukraine, USA, Brazil, Argentina, Mexico, Australia.

Languages offered at registration: Urdu, Punjabi, English, Hindi,
Bengali, Swahili, Turkish, Ukrainian, Portuguese, Spanish — or any
other language name the farmer types.

## Files

| File | What it is |
|---|---|
| `server.js` | The whole bot server (Express, Node 20+) |
| `package.json` | One dependency only: `express` |
| `db.json` | Saved farmers, sessions, sent log (starts empty) |
| `README.md` | This file |

## Deploy on Railway (same account / style as Kisan Dost)

Railway is the host already used for Kisan Dost. No card is needed
for the free trial already in use there.

### 1. Put the code on GitHub (once)

From this folder, in a terminal:

```bash
cd ~/workspace/goals/kisan-dost-farmer-agent/files/global-farmer-friend-telegram
git init
git add server.js package.json db.json README.md
git commit -m "Global Farmer Friend Telegram bot"
```

Create a **new public repo** on GitHub (for example
`global-farmer-friend-telegram`) and push to it. Or add this
folder as a second service in the existing Kisan Dost repo —
either way, Railway needs a repo to deploy from.

### 2. Create the Railway service

1. Open Railway → **New Project** (or open the existing
   Kisan Dost project and add a service) → **Deploy from GitHub repo**
   → pick the repo above.
2. Railway will detect Node and run `npm start` (`node server.js`).
3. Wait until the deploy says **Active / Online**.

### 3. Add the environment variables (owner does this himself)

Railway → service → **Variables** tab → add:

| Variable | Value — who sets it |
|---|---|
| `TELEGRAM_BOT_TOKEN` | **Owner pastes it himself in Railway.** This is the token BotFather gave when the bot was created. Never send it in chat, never screenshot it. |
| `ADMIN_KEY` | Owner picks a secret word, e.g. `global-admin-2026`. Used for `/admin/send-alert` and `/admin/farmers`. Do not share it. |

No other variables are required. `PORT` is set by Railway itself.

After adding the variables, **Redeploy** the service (Railway
usually redeploys automatically when a variable changes).

### 4. Set the Telegram webhook (owner does this in his browser)

After the service is online, copy its Railway domain, for example:

`global-farmer-friend-telegram-production.up.railway.app`

Then, in a browser address bar, open this URL — replacing
`<token>` with the BotFather token and `<railway-domain>`
with the domain above. **Do this in your own browser, never
send the finished URL to anyone, because it contains the token:**

```
https://api.telegram.org/bot<token>/setWebhook?url=https://<railway-domain>/telegram
```

Example shape (with placeholders, not a real token):

```
https://api.telegram.org/bot123456:ABC-DEF/setWebhook?url=https://global-farmer-friend-telegram-production.up.railway.app/telegram
```

Telegram should answer:

```json
{"ok":true,"result":true,"description":"Webhook was set"}
```

If it says `{"ok":false,...}`, check the token and the domain
and try again. Do not paste the URL with the token into chat.

### 5. Test — the proof it is live

1. Open Telegram → open **@GlobalFarmerFriendBot**
   (https://t.me/GlobalFarmerFriendBot) → tap **START**
   (or send `/start`).
2. The bot should reply with the welcome message and ask
   for your name.
3. Answer: name → country number (e.g. `1` for Pakistan) →
   crop (e.g. `Wheat`) → language number (e.g. `1` for Urdu).
4. It should reply "✅ You are registered" with your
   country, crop and language.
5. Then type a question, e.g. `When should I sow wheat?`
   It should answer in your saved language / English.
6. Check Railway → service → **Logs / Console**: you should
   see a line starting with `Incoming from <your chat id>`
   for each message you sent.
7. Check `GET https://<railway-domain>/health` — it should
   show `{"ok":true,"service":"global-farmer-friend-telegram","mode":"live","farmers":1}`.

If `/start` gets **no reply**, work through this list, in order:

1. Railway Logs: is there an `Incoming` line? No → the
   webhook is not reaching Railway (re-do step 4, check the
   domain is exactly the live one).
2. Railway Logs: is the service running, or did it crash on
   start? Check for an error at the top of the logs.
3. Railway Variables: is `TELEGRAM_BOT_TOKEN` set, with no
   extra space at the start or end? (A wrong / 24-hour /
   revoked token gives `mode: live` in `/health` only if a
   token is set — it does **not** prove the token is valid.
   The real proof is a reply to `/start`.)
4. Try `/start` again from a second Telegram account / phone.

## Admin broadcast

Send a message to all saved farmers (or a filtered group):

```bash
curl -X POST https://<railway-domain>/admin/send-alert \
  -H "Content-Type: application/json" \
  -H "x-admin-key: <ADMIN_KEY>" \
  -d '{"message":"Rain is expected tomorrow. Do not spray today.","country":"Pakistan"}'
```

Omit `country` / `crop` / `language` to send to everyone.
In mock mode (no token) the message is only logged, not sent.

List farmers:

```
GET https://<railway-domain>/admin/farmers?admin_key=<ADMIN_KEY>
```

## Mock mode (testing without a token)

If `TELEGRAM_BOT_TOKEN` is not set, the server starts in
`mode: mock` — it does not crash, `/health` returns
`mode: "mock", farmers: 0`, and webhook messages are logged
as `[MOCK] -> <chat_id>: ...` instead of being sent.
That is how the code was verified before deploy.

## Limits — stated honestly

- Storage is `db.json` (fine for the first 100–500 farmers).
  Railway restarts can lose it if the disk is ephemeral — move
  to a real database before the farmer count grows.
- Weather and live mandi prices are **not** live in this free
  version — the bot says so, and tells the farmer to check
  the local forecast / mandi. Adding a free weather API
  (e.g. Open-Meteo) is a later step, no key needed.
- Photo diagnosis is general advice only, not a final
  diagnosis. A real vision/LLM step would carry a small
  per-photo cost and is not included here.
- Telegram bots can only message a farmer after that farmer
  has tapped START once. The bot cannot message a random
  number that never joined.
