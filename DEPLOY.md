# Japan Place Planner - Shared Deployment Guide

This app is now wired for a shared Supabase backend so multiple people can edit the same list.

## 1) Create Supabase project
1. Create a project in Supabase.
2. Open SQL Editor and run: `supabase/schema.sql`.
3. In Supabase Settings -> API, copy:
   - Project URL
   - `anon` public key

## 2) Configure app
1. Open `config.js`.
2. Set values:

```js
window.APP_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
  storageBucket: "place-photos",
  seedOnFirstRun: true,
  enableRealtime: true,
};
```

## 3) Test locally
Open `index.html` in browser.
- If config is correct, header shows "Connected to shared database."
- First run auto-imports seed places if DB is empty.

## 4) Deploy to Vercel (shareable URL)
1. Push this folder to a GitHub repo.
2. In Vercel: `New Project` -> import repo.
3. Deploy with defaults (static site).
4. Share the Vercel URL.

## 5) Update through Codex later
Workflow:
1. Ask Codex to change features in this repo.
2. Commit + push changes to GitHub.
3. Vercel auto-redeploys.

## Optional: safer access
Current policies allow anyone with the link to edit.
If you want limited editing, we can switch to Supabase Auth + protected policies.
