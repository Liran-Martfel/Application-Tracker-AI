# Updating the system

The system has two halves that must run the same code: the **site** (Cloudflare Worker) and the **Job Feed**
(Apps Script). Both carry the same `CODE_VERSION` (`site/src/version.js` and `apps-script/Shared.gs`).

## How the user learns there is something to do
- **A new version of this template:** once a day the site reads the template's `VERSION` file. When it is newer,
  Nika sends once: "🆕 יש גרסה חדשה של המערכת (X, אצלך Y)". The user tells Claude: "תעדכן את מערכת החיפוש לגרסה החדשה".
- **One half was not updated:** every time the site reads fresh data, it compares the versions. Nika sends once per pair:
  - "⚠️ קוד ה-Apps Script מאחור" → the Apps Script files were not all updated (or the web app still runs old code);
  - "⚠️ האתר מאחור" → the site was not deployed after the Apps Script files changed.

## Updating to a new template version (Claude, with the user)
1. **Read what changed:** compare the new `assets/` with the user's copies (their site folder and their filled
   Apps Script files). List the changes in plain words, 3–6 lines, and get an OK.
2. **Carry the user's values over:** never overwrite a filled file with a template file. Take the new template file,
   fill its `{{PLACEHOLDERS}}` with the same values as in the user's current file (a new placeholder → ask or use the
   profile), and keep any change the user made on purpose (ask when unsure).
3. **Test locally** (site-guide.md step 5, and `node scripts/check-version.mjs`): everything passes.
4. **Apps Script:** `node scripts/gs-sync.mjs push` (route A) — it runs the tests, pushes all files and moves the web app.
   Without clasp: hand the changed files one at a time (route B), then **Deploy → Manage deployments → ✏️ → New version**.
5. **Site:** the user OKs, then `npm run deploy`.
6. **New one-time setups:** if the change list says so (for example a new `setup…` function, a new Script Property or a
   new secret), walk the user through it now.
7. **Check:** run `runFeed` once; Nika sends no "⚠️ … מאחור" message; the dashboard loads. Update `setup.notes`.

## Updating your own changes (when Claude changes the code for the user)
- A change in `apps-script/` or in the site that the other half depends on → raise `CODE_VERSION` on **both** sides
  (format `YYYY.MM.DD`, a second release the same day `YYYY.MM.DD.2`); `node scripts/check-version.mjs` must pass.
- Then the same steps 3–5 above. Order: Apps Script first when the site needs a new API action; the site first when
  Apps Script calls a new site route (`/api/push`). Either way, Nika's version message tells if one half is behind.

## gs-sync (Apps Script in one command)
| Command | What it does |
|---|---|
| `node scripts/gs-sync.mjs setup <SCRIPT_ID>` | once: links the folder to the project, copies the project's settings (`appsscript.json`), finds the web app |
| `node scripts/gs-sync.mjs push` | version check + tests → pushes every `.gs` file → moves the web app to the new code (same URL) |
| `node scripts/gs-sync.mjs status` | the linked project, the web app, the local code version |
**Before the first `setup` (the user, once):** https://script.google.com/home/usersettings → Google Apps Script API →
**On**; then `npx @google/clasp@3.4.1 login` and sign in with the same Google account as the Sheet. The login is saved by
clasp in the user's home folder (`.clasprc.json`): it is a credential, never open it, never copy it anywhere.
**The script ID:** Apps Script → ⚙️ **Project Settings** → **IDs** → **Script ID**.
**Errors:**
| What you see | Fix |
|---|---|
| "User has not enabled the Apps Script API" | turn it on at script.google.com/home/usersettings, wait a minute, run again |
| "Could not read API credentials" / not logged in | `npx @google/clasp@3.4.1 login` |
| "test … failed, nothing was pushed" | a test failed: fix the code first (nothing reached the project) |
| a function or trigger missing after a push | the project now holds exactly the folder's files: make sure every `.gs` file is in the folder; triggers point to function names and stay |
| several deployments found at setup | write the web app's id into `apps-script/.clasp-deploy.json` as `{"deploymentId": "…"}` (Deploy → Manage deployments shows it) |
