# Toppers Hub Academy — Fees & Student Manager 📚

A mobile-friendly app to manage students, teachers, monthly fees, renewal dates
and reminders for **Toppers Hub Academy**. Built to be handed to your mum to run
day-to-day: she can see who owes fees, tap a button to send a WhatsApp reminder,
record payments, and manage teachers and co-teacher fees.

- 📱 **Installs on the phone** like a real app (Progressive Web App)
- ☁️ **Free cloud sync** via Supabase — you and your mum see the same data
- 💬 **One-tap reminders** — WhatsApp, copy-paste, or email, with ready-made messages
- 🔔 **Due & overdue alerts** right on the home screen
- 👩‍🏫 **Teachers & co-teachers** — assign students, track co-teacher fees & payouts
- 💰 **Money view** — collected this month, expected, outstanding, teacher payouts
- 💸 **Zero cost** — Vercel (hosting) + Supabase (database) free tiers are plenty

---

## Try it right now (no setup)

Open `index.html` in any browser. It runs in **Demo mode** — data is saved only
on that one device. Great for testing. To sync between phones, do the steps below.

---

## Full setup — free cloud, ~15 minutes

You'll create two free accounts: **Supabase** (the database) and **Vercel** (the
website host). No credit card needed.

### Step 1 — Create the database (Supabase)
1. Go to **https://supabase.com** → *Start your project* → sign in with Google/GitHub.
2. Click **New project**. Give it a name (e.g. `toppers-hub`), set a database password
   (save it somewhere), pick the region closest to you, and create it.
3. Wait ~1 minute for it to finish setting up.

### Step 2 — Create the tables
1. In your project, open **SQL Editor** (left sidebar) → **New query**.
2. Open the file **`schema.sql`** from this folder, copy everything, paste it in, and
   click **Run**. You should see *Success*. Your tables are ready.

### Step 3 — Get your keys and put them in the app
1. In Supabase, open **Project Settings** (gear icon) → **API**.
2. Copy the **Project URL** and the **anon public** key.
3. Open **`config.js`** in this folder and paste them in:
   ```js
   SUPABASE_URL: "https://YOURPROJECT.supabase.co",
   SUPABASE_ANON_KEY: "eyJhbGci....(the long anon key)",
   ```
4. (Optional) set `ACADEMY_CONTACT` to your WhatsApp number so it appears in messages.

### Step 4 — Turn off email confirmation (so login is instant)
1. In Supabase → **Authentication** → **Providers** (or **Sign In / Providers**) →
   **Email**.
2. Turn **OFF** "Confirm email". Save. (This lets you and your mum log in immediately.)

### Step 5 — Put it online for free (Vercel)
**Easiest way (drag & drop):**
1. Go to **https://vercel.com** → sign in with GitHub/Google.
2. On the dashboard look for **Add New → Project → Deploy** — or use
   **https://vercel.com/new** and choose the option to upload/deploy a folder.
3. Upload **this whole folder** (the one containing `index.html`). Deploy.
4. Vercel gives you a link like `https://toppers-hub.vercel.app` — that's your app!

> Prefer GitHub? Push this folder to a new GitHub repo, then in Vercel choose
> **Import Git Repository** and select it. Every future edit you push auto-deploys.
> No build settings needed — it's a plain static site.

### Step 6 — Create your login & install on the phone
1. Open your Vercel link on the phone. Tap **Create an account** (use one email +
   password that you and your mum will share, so you both see the same data).
2. **Install to home screen:**
   - **Android (Chrome):** menu ⋮ → *Add to Home screen* / *Install app*.
   - **iPhone (Safari):** Share button → *Add to Home Screen*.
3. It now opens full-screen like a normal app, and works offline for viewing.

Done! 🎉

---

## How to use it (quick tour for your mum)

- **Home** — see active students, who's overdue, who's due soon, and money collected
  this month. Tap **"Remind all overdue"** to send WhatsApp reminders one by one.
- **Add a student** — name, monthly fee, next due date, and which teacher. Optional
  co-teacher + co-teacher fee, phone/guardian phone for reminders.
- **Record a payment** — open a student → *Record payment*. It auto-moves the next
  due date forward one month and can send a receipt on WhatsApp.
- **Send a reminder** — open a student → *Send reminder* → pick a ready message
  (reminder / overdue / renewal / welcome), edit if you like, then WhatsApp / Copy / Email.
- **Teachers** — add teachers and co-teachers, see their students and monthly payouts.
- **Money** — collection, expected, outstanding, and each teacher's payout summary.
- **Settings (⚙️)** — export a JSON backup of everything anytime.

**Tip:** save phone numbers **with country code** (e.g. `+9198...`) so WhatsApp opens
the right chat.

---

## Free-tier limits (plenty for an academy)
- **Supabase free:** 500 MB database, 50,000 monthly active users, unlimited API
  requests. A coaching academy will use a tiny fraction of this.
- **Vercel free (Hobby):** 100 GB bandwidth/month, unlimited static hosting.
- Both are free forever on these tiers for personal use.

## Files in this folder
| File | What it is |
|------|-----------|
| `index.html` | The app (open this) |
| `app.js` | All the logic |
| `config.js` | **Your Supabase keys go here** |
| `schema.sql` | Run once in Supabase to create the tables |
| `manifest.json`, `sw.js`, `icons/` | Make it installable & work offline |
| `README.md` | This guide |

## Notes for your portfolio
This is a full PWA: offline-capable, installable, with a Supabase (Postgres) backend,
row-level-security so data is private per account, and a clean mobile-first UI built
in vanilla JS (no build step). Good talking points: RLS policies, service-worker
caching strategy (network-first for data, cache-first for the shell), and the
WhatsApp deep-link reminder flow.

*Automated email reminders* (sent on a schedule without tapping) can be added later
with a Supabase Edge Function + a free email service like Resend — ask and it can be
wired up. Today's email option opens your email app with the message pre-filled.
