window.APP_CONFIG = {
  // Supabase project URL (Settings -> API -> Project URL)
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",

  // Supabase anon key (Settings -> API -> Project API keys -> anon public)
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",

  // Storage bucket for uploaded photos
  storageBucket: "place-photos",

  // If true, inserts seed places from data/seed-places.js when DB is empty
  seedOnFirstRun: true,

  // Live refresh when anyone updates a place
  enableRealtime: true,
};
