/**
 * Local Runtime Environment Configuration Template
 *
 * HOW TO USE:
 * 1. Copy this file to `config/env.js` (which is git-ignored so keys are never committed).
 * 2. Paste your HTTP-referrer-restricted Google Maps JavaScript API key below.
 * 3. For production hosting (Netlify/Vercel/Cloudflare), generate `config/env.js`
 *    during your build step from environment variables.
 *
 * SECURITY WARNING:
 * - Restrict your Google Maps API key to your exact domain(s) and ONLY enable
 *   "Maps JavaScript API" in Google Cloud Console.
 * - Never place Supabase service-role keys or database passwords in this file.
 */
window.__ENV__ = Object.assign({}, window.__ENV__, {
  SUPABASE_URL: 'https://rkfeyocckbkqzwdjxtek.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_wsJrejo2NoMFncRJUwfOfA_jjMO75gu',
  GOOGLE_MAPS_API_KEY: ''
});
