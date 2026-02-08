---
name: landing-page-cta
description: "Add a Google Sign-In CTA to the Cookin' landing page so visitors can sign up directly from the marketing page."
model: sonnet
color: blue
---

You are adding a Google Sign-In call-to-action to the Cookin' landing page at `static/index.html`. This is a standalone HTML file (no React, no build step) served by Express at `GET /`.

## Task

Add a "Sign in with Google" button to the landing page so visitors can sign up directly. When they sign in, redirect them to the web app at `/app` (the React frontend).

## How it should work

1. Load the Google Sign-In JavaScript library (`https://accounts.google.com/gsi/client`)
2. Render a Google Sign-In button in the hero section, below the description paragraph
3. On successful sign-in, POST the credential to `/api/auth/google` (the existing backend endpoint)
4. On success, redirect to the React app (served at `/app` — see routing note below)
5. Also add a smaller "Sign in" link/button in the header, top right

## Important context

### Google Client ID
The Google Client ID needs to be available to this static HTML page. Since this is a plain HTML file with no build step, the backend should inject it.

Modify `src/sender/webhook.ts` (which serves the landing page at `GET /`) to read the HTML file, replace a placeholder `{{GOOGLE_CLIENT_ID}}` with the actual value from `config.googleClientId`, and serve the result. Use a simple string replace — no template engine needed.

Currently the route is:
```typescript
webhookRouter.get('/', (_req, res) => {
  res.sendFile('index.html', { root: 'static' });
});
```

Change it to read the file, do the replacement, and send:
```typescript
import fs from 'fs';
import path from 'path';

// Cache the template once
let landingHtml: string | null = null;

webhookRouter.get('/', (_req, res) => {
  if (!landingHtml) {
    landingHtml = fs.readFileSync(path.join('static', 'index.html'), 'utf-8');
  }
  const html = landingHtml.replace(/\{\{GOOGLE_CLIENT_ID\}\}/g, config.googleClientId);
  res.type('html').send(html);
});
```

Import `config` from `../config.js`.

### Routing between landing page and React app
Currently:
- `GET /` serves the static landing page
- The React app is served from `web-dist/` as static files

The landing page should remain at `/`. The React app (for authenticated users) needs to be accessible too. In `src/index.ts`, the React app's SPA catch-all already serves `index.html` for unmatched routes. After signing in from the landing page, redirect to any path that the React app handles (e.g. `/app` or just `/chat`). The React app's router will handle it.

Actually, the simplest approach: after successful Google sign-in on the landing page, just redirect to `/` — but the React app and landing page both serve from `/`. To avoid conflict, redirect to `/chat` which will be caught by the SPA fallback and load the React app. The React router will then show the chat page (the user is now authenticated via the session cookie set by `/api/auth/google`).

### Style guidelines
- Match the existing dark theme (colors in CSS `:root` variables)
- The Google Sign-In button should use `theme: 'filled_black'` to match the dark design
- Add a styled "Sign in" text link in the header (right side) that scrolls to the hero button or triggers sign-in
- Keep the existing page structure intact — only add, don't remove or rearrange

### Banner update
Change the banner text from "Stay tuned for updates!" to something that invites sign-up, e.g. "Try Cookin' free — sign in to get started"

## Files to modify
1. `static/index.html` — add Google Sign-In script, button in hero, sign-in link in header, credential placeholder
2. `src/sender/webhook.ts` — inject GOOGLE_CLIENT_ID into the HTML template

## Do NOT modify
- Any React frontend files (the `web/` directory)
- The API router or auth endpoints (they already work)
