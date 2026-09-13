# Light/dark theme handoff

The default is dark. The `theme-preference` localStorage key stores `dark` or `light`. Invalid/missing preferences default to dark. Blocked storage does not prevent the page from loading or the toggle from working. A saved preference also follows navigation and refreshes; changes in another tab update the mounted toggle.

## Implementation files

- `tailwind.config.js`: `darkMode: 'class'`, Fraunces display / IBM Plex Sans body font families, and named light palette utilities.
- `src/theme.css`: the light palette is defined once at the top (`--light-page`, `--light-surface`, `--light-accent`, etc.). Legacy paint aliases map to these roles in light mode. The `.dark` block preserves every original CSS paint value, including alpha values used in shadows and gradients.
- `index.html`: Google Fonts links and the early inline initialization script. The same bootstrap/fonts are included in `challenge-demo.html` and `syllabus-demo.html`.
- `src/components/ThemeToggle.jsx`: keyboard-accessible sun/moon toggle, pressed state, persistence, and cross-tab synchronization.
- `src/components/AppLayout.jsx`: mounts the toggle in the shared header.
- `src/styles.css`, `src/challenge-demo.css`, `src/features/challenges/challenges.css`: existing custom styles use theme paint aliases, and display text uses Fraunces. Font sizes, weights, spacing, and breakpoints are retained; the landing accent word is italic.

This repository uses Tailwind v4. Both CSS entries explicitly load `tailwind.config.js` using `@config`, and use `@custom-variant dark (&:where(.dark, .dark *))`. Adding a JavaScript config alone would not wire it into this app.

## Components to spot-check

- Landing, RoomDashboard, Session, NotFound, SignIn, and AppLayout.
- PhonePresencePage and SharedScreen: focused/paused states and timer controls.
- Syllabus Dashboard, SyllabusUpload, TeachTopic, CreateRoom, JoinRoom, SyllabusTracker, and shared `ui.jsx` styles. Untouched / taught / verified use danger / warning / success in light mode.
- Leaderboard: progress bars, ranking text, and existing custom color utilities.
- ChallengeEngine and SessionChallenges: puzzle panels, participant avatars, help modal, and actions.
- The syllabus demo's notice also has light/dark color variants.

Existing color utilities are preserved verbatim with a `dark:` prefix and paired with a light semantic utility. Existing app-level overrides remain scoped to the dark theme so they retain their original precedence.

## Verification

- Production/GitHub Pages build and TypeScript validation passed.
- Full suite: 106 tests passed (29 React, 69 feature/server/database, 8 Node).
- 29 React tests passed, including 7 theme tests: default/saved/invalid preferences, persistence, blocked storage, and cross-tab updates.
- A live session/challenge view's 135 inspected main-content elements had identical computed color, background, border, shadow, and gradient values before and after the migration in dark mode. This is a focused comparison, not a claim of a screenshot comparison for every possible app state.
- Browser checks confirmed saved light mode after reload, IBM Plex Sans body text, Fraunces headings, and no horizontal overflow on the home page at 390px.

No backend, credentials, API contracts, or database schema changed. The GitHub Pages workflow publishes updates pushed to main.

## Repository organization

- Shared palette and font tokens: `src/theme.css`; Tailwind integration: `tailwind.config.js`.
- Shared navigation and controls: `src/components/`. Theme behavior tests live beside the toggle.
- Room and navigation pages: `src/pages/`.
- Phone presence and shared focus timer: `src/campfire/`.
- Challenges, syllabus, and leaderboard retain their respective `src/features/` folders.
- `api/`, `server/`, and `supabase/` remain separate and unchanged by the theme work.
- Typography declarations stay with the component styles they affect; the global heading family is defined once in `src/theme.css`.

Integrated on top of the latest GitHub main commit `edd4371`; no feature branches were merged into main as part of this UI update.
