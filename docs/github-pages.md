# GitHub Pages deployment

GitHub Pages must publish Vite's compiled `dist` artifact, not the repository source. The source HTML loads `/src/main.jsx`, which a static host cannot compile. `.github/workflows/pages.yml` now builds and publishes the app on pushes to main.

In repository Settings → Pages → Build and deployment, select GitHub Actions as the source. The workflow sets the asset base to `/campfire/` and uses hash routes so shared links and reloads work without server rewrites. Vercel and local builds retain ordinary browser routes.

`config/public-supabase.json` contains only the intentionally public Supabase URL and anon key used by the browser. No Gemini, service-role, signing or Vercel credentials are included. RLS remains responsible for database access.

GitHub Pages runs no serverless functions. Auth, rooms, leaderboard, focus mode and database-backed practice puzzles can use Supabase directly. Gemini parsing, teaching and generation require an API host; this deployment displays that limitation instead of sending requests to nonexistent endpoints. No Vercel project or paid hosting is created by this workflow.
