# ♠ BlackJack Score Keeper

Virtual Blackjack scoring for home games. Real-time sync across phones, no installation needed.

**Stack:** HTML/CSS/JS · Firebase Firestore · Vercel (hosting + API) · GitHub

---

## How credentials work

```
Vercel Environment Variables  (server-side, never exposed in source)
        ↓
/api/config.js  (Vercel serverless function — reads process.env)
        ↓
Browser fetches /api/config on load → gets Firebase credentials → initialises Firebase
```

The `api/config.js` file reads from `process.env` on the server — credentials never appear
in your GitHub repo or in the page HTML source.

---

## Project Structure

```
blackjack-pwa/
├── index.html            ← Single-page app
├── manifest.json         ← PWA manifest
├── sw.js                 ← Service worker
├── vercel.json           ← Vercel routing config
├── firebase.json         ← Firebase CLI (Firestore rules only)
├── firestore.rules       ← Firestore security rules
├── api/
│   └── config.js         ← Vercel serverless function (serves Firebase config)
├── css/
│   └── style.css
└── js/
    ├── firebase-service.js  ← Fetches /api/config, then initialises Firebase
    ├── game-logic.js
    ├── ui.js
    └── app.js
```

---

## Setup

### 1. Firebase

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → Add project
2. Build → **Firestore Database** → Create database → Production mode → `asia-southeast1`
3. Firestore → **Rules** tab → paste contents of `firestore.rules` → Publish
4. Project Settings → Your Apps → **</>** Web → Register app → copy `firebaseConfig` values

### 2. Vercel Environment Variables

Vercel dashboard → your project → **Settings → Environment Variables**

Add these 6 variables (no `VITE_` prefix — these are server-side now):

| Key | Value (from Firebase firebaseConfig) |
|-----|--------------------------------------|
| `FIREBASE_API_KEY` | `apiKey` value |
| `FIREBASE_AUTH_DOMAIN` | `authDomain` value |
| `FIREBASE_PROJECT_ID` | `projectId` value |
| `FIREBASE_STORAGE_BUCKET` | `storageBucket` value |
| `FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` value |
| `FIREBASE_APP_ID` | `appId` value |

### 3. Deploy

Push to GitHub → Vercel auto-deploys.

Or manually: Vercel dashboard → Deployments → ⋯ → Redeploy.

### 4. Verify

Visit your site → open browser console → should see:
```
[Firebase] Initialised with project: your-project-id
```

---

## Payout Rules

| Outcome | Payout |
|---------|--------|
| Win | +1× bet |
| Blackjack | +2× bet |
| Loss | −1× bet |
| Draw | 0 |
| Double Down Win | +2× bet |
| Double Down Loss | −2× bet |
| Triple | +3× bet |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Spinner never stops | Open console — check for `/api/config` errors |
| `projectId is not set` | Add `FIREBASE_PROJECT_ID` to Vercel env vars and redeploy |
| `permission-denied` | Paste `firestore.rules` into Firebase Console → Firestore → Rules → Publish |
| QR scanner won't open | Use "Enter Code" tab instead; camera needs HTTPS + permission |
