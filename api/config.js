/**
 * /api/config.js
 * ──────────────
 * Vercel serverless function that reads Firebase credentials
 * from Vercel Environment Variables (server-side, secure) and
 * returns them as JSON to the browser.
 *
 * This is the correct way to inject env vars into a plain static
 * HTML site on Vercel — no build tool or %VITE_*% substitution needed.
 *
 * Called once on app load: fetch('/api/config') → get credentials → init Firebase.
 */
export default function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const config = {
    apiKey:            process.env.FIREBASE_API_KEY             || '',
    authDomain:        process.env.FIREBASE_AUTH_DOMAIN         || '',
    projectId:         process.env.FIREBASE_PROJECT_ID          || '',
    storageBucket:     process.env.FIREBASE_STORAGE_BUCKET      || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId:             process.env.FIREBASE_APP_ID              || '',
  };

  // If projectId is empty the app can't work — signal this clearly
  if (!config.projectId) {
    return res.status(500).json({
      error: 'Firebase environment variables not configured in Vercel.',
      hint:  'Add FIREBASE_* variables in Vercel → Settings → Environment Variables'
    });
  }

  // Cache for 5 minutes (config never changes at runtime)
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate');
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(config);
}
