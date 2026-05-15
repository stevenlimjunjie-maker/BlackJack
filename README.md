# ♠ BlackJack Score Keeper

> Virtual Blackjack scoring for home games. Real-time sync across phones, no installation needed.

**Stack:** Static HTML/CSS/JS · Firebase Firestore (real-time DB) · Vercel (hosting) · GitHub (source)

---

## Project Structure

```
blackjack-pwa/
├── index.html               ← Single-page app (all screens)
├── manifest.json            ← PWA — installable to home screen
├── sw.js                    ← Service worker (offline support)
├── vercel.json              ← Vercel routing + cache headers
├── firebase.json            ← Firebase CLI config (Firestore rules only)
├── firestore.rules          ← Firestore security rules
├── .env.local.example       ← Copy to .env.local for local dev
├── .gitignore
├── css/
│   └── style.css
└── js/
    ├── config.js            ← Reads credentials from window.__env
    ├── firebase-service.js  ← All Firestore read/write operations
    ├── game-logic.js        ← Payout calculations (pure functions)
    ├── ui.js                ← DOM helpers, QR, toast, confetti
    └── app.js               ← Main controller & event handlers
```

---

## Payout Rules

| Outcome | Multiplier |
|---------|-----------|
| Win | +1× bet |
| Blackjack | +2× bet |
| Loss | −1× bet |
| Draw | 0 |
| Double Down Win | +2× bet |
| Double Down Loss | −2× bet |
| Triple | +3× bet |

---

## Deployment: GitHub → Vercel

### 1. Fork / clone to GitHub

```bash
git clone https://github.com/YOUR_USERNAME/blackjack-pwa.git
cd blackjack-pwa
```

### 2. Set up Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. **Build → Firestore Database** → Create database (production mode, pick a region)
3. **Project Settings → Your Apps → </> Web** → Register app → copy the `firebaseConfig` values

### 3. Deploy Firestore security rules

```bash
npm install -g firebase-tools
firebase login
firebase init firestore       # select your project; accept firestore.rules as rules file
firebase deploy --only firestore:rules
```

### 4. Connect repo to Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. **Framework Preset:** Other (no build step needed)
4. **Root Directory:** `.` (leave default)
5. Click **Environment Variables** and add all six:

| Name | Value |
|------|-------|
| `VITE_FIREBASE_API_KEY` | `AIzaSy...` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `your-project` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `123456789` |
| `VITE_FIREBASE_APP_ID` | `1:123:web:abc` |

6. Click **Deploy** — Vercel builds and publishes in ~30 seconds
7. Your live URL: `https://your-project.vercel.app`

> **Every `git push` to `main` auto-redeploys.** No manual steps after initial setup.

---

## Local Development

```bash
# 1. Copy the example env file
cp .env.local.example .env.local

# 2. Fill in your Firebase values in .env.local

# 3. Serve locally (any static server works)
npx serve .
# or
python3 -m http.server 3000
```

Open `http://localhost:3000`.

> ⚠️ The `%VITE_*%` placeholders in `index.html` are only substituted by Vercel at deploy time.
> For local dev without a build tool, set `DEMO_MODE: true` in `js/config.js` temporarily,
> or use the Vercel CLI (see below).

### Local dev with Vercel CLI (substitutes env vars properly)

```bash
npm install -g vercel
vercel dev          # reads .env.local, substitutes placeholders, serves on localhost:3000
```

This is the closest match to production and is the recommended local dev approach.

---

## How Credentials Stay Secret

```
GitHub repo          ← config.js reads window.__env  (no secrets in code)
    ↓ git push
Vercel build         ← substitutes %VITE_*% placeholders with real values
    ↓
Browser receives     ← index.html with real values baked into the inline script
                        (values are public in the browser, but that's fine for
                         Firebase client-side keys — Firestore rules enforce security)
```

Firebase client-side API keys are **not secret** by design — they identify your project, not authenticate you. Security is enforced by Firestore rules (`firestore.rules`), which restrict what anonymous users can read and write.

---

## Firestore TTL (auto-expire old games)

In the Firebase Console:
**Firestore → Indexes → TTL Policies → Add policy**
- Collection group: `games`
- Field path: `createdAt`
- TTL: `86400` seconds (24 hours)

---

## Customisation

| What | Where |
|------|-------|
| Payout multipliers | `js/game-logic.js` → `OUTCOMES` object |
| Starting balance options | `index.html` → `.chip-opt` buttons |
| Min bet | `js/config.js` → `MIN_BET` |
| Max players (up to 4) | `js/config.js` → `MAX_PLAYERS` |
| Colours / fonts | `css/style.css` → `:root` variables |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Blank page / no Firebase | Check Vercel env vars are set and redeployed |
| `%VITE_FIREBASE_API_KEY%` visible in source | Env var not set in Vercel — add it and redeploy |
| QR scanner won't open | Browser needs camera permission; use "Enter Code" tab instead |
| Players not syncing | Open browser console — Firebase errors will show there |
| Firestore permission denied | Run `firebase deploy --only firestore:rules` again |

---

*Virtual scoring only — no real money involved.*
