# Google Maps Setup & Security Guide

## 1. Enable Required Google Cloud APIs

In **Google Cloud Console** -> **APIs & Services -> Library**, enable:
1. **Maps JavaScript API** *(required — powers the interactive maps, markers, InfoWindows, and the `visualization` HeatmapLayer library)*.

*(Google Maps Directions links open directly in Google Maps via `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG` and require no extra Directions API billing!)*

## 2. Enable Billing & Set Budget Alerts

Google Maps Platform requires an active billing account (with free monthly usage thresholds):
1. Open **Google Cloud Console -> Billing** and link a billing account to your project.
2. Go to **Billing -> Budgets & alerts** and create a monthly budget alert (e.g. \$5 / \$10) plus optional daily quota caps under **Maps JavaScript API -> Quotas** to prevent unexpected charges.

## 3. Restrict Your API Key (Critical!)

Never use an unrestricted Google Maps API key in browser code.

In **APIs & Services -> Credentials -> [Your API Key]**:
1. **Application restrictions** -> Select **Websites (HTTP referrers)** and add ONLY your authorized origins:
   - Local development:
     - `http://localhost:*/*`
     - `http://127.0.0.1:*/*`
   - Production domain(s):
     - `https://your-domain.com/*`
     - `https://*.your-domain.com/*`
2. **API restrictions** -> Select **Restrict key** and check ONLY:
   - **Maps JavaScript API**
3. Click **Save** (restrictions take 1–5 minutes to propagate).

## 4. Configure Key in This Project (Without Committing Secrets)

1. Copy `config/env.example.js` to **`config/env.js`** (`config/env.js` is listed in `.gitignore` so Git never commits your key).
2. Paste your restricted key into `GOOGLE_MAPS_API_KEY`:
   ```js
   window.__ENV__ = Object.assign({}, window.__ENV__, {
     SUPABASE_URL: 'https://rkfeyocckbkqzwdjxtek.supabase.co',
     SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_wsJrejo2NoMFncRJUwfOfA_jjMO75gu',
     GOOGLE_MAPS_API_KEY: 'YOUR_RESTRICTED_KEY_HERE'
   });
   ```
3. Run the site via a local web server (e.g. `npx serve .` or VS Code Live Server at `http://localhost:3000`) so browser Geolocation, GeoCamera, and HTTP referrer restrictions work properly.
4. For production CI/CD (Netlify, Vercel, Cloudflare Pages), generate `config/env.js` during the build command from your hosting environment variable `GOOGLE_MAPS_API_KEY`.
