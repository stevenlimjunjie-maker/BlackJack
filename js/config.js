/**
 * config.js
 * ─────────────────────────────────────────────────────────
 * Firebase credentials are injected at runtime via
 * window.__env (set by the inline <script> in index.html,
 * which reads Vercel environment variables server-side).
 *
 * ⚠️  NEVER hardcode credentials here — this file is
 *     public on GitHub. All secrets live in Vercel's
 *     Environment Variables dashboard instead.
 *
 * Vercel env vars to configure (Settings → Environment Variables):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 *
 * For local development create a .env.local file (git-ignored):
 *   VITE_FIREBASE_API_KEY=AIzaSy...
 *   VITE_FIREBASE_PROJECT_ID=my-project
 *   ... etc
 * ─────────────────────────────────────────────────────────
 */

// Read credentials injected by the inline env-bridge script in index.html.
const _env = window.__env || {};

const FIREBASE_CONFIG = {
  apiKey:            _env.FIREBASE_API_KEY             || '',
  authDomain:        _env.FIREBASE_AUTH_DOMAIN         || '',
  projectId:         _env.FIREBASE_PROJECT_ID          || '',
  storageBucket:     _env.FIREBASE_STORAGE_BUCKET      || '',
  messagingSenderId: _env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             _env.FIREBASE_APP_ID              || '',
};

/**
 * APP-LEVEL CONSTANTS — safe to commit, no secrets.
 */
const APP_CONFIG = {
  MAX_PLAYERS:         4,
  DEFAULT_BALANCE:     1000,
  SESSION_CODE_LENGTH: 6,
  SESSION_TTL_HOURS:   24,
  MIN_BET:             10,
  ROUND_HISTORY_LIMIT: 50,
  DEMO_MODE:           false,
};

Object.freeze(FIREBASE_CONFIG);
Object.freeze(APP_CONFIG);
