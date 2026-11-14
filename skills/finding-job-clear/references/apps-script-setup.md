# Running Google Apps Script (Job Feed) — full guide

The Job Feed (`assets/apps-script/`, section 5e) runs on Google's servers every hour, for free, even when the computer is off and when Claude's usage has run out. Claude prepares the code; the user pastes it and approves it once. Claude cannot press buttons in the Apps Script editor for them.

This guide is phase 2 of `references/setup-roadmap.md` (start there for the whole order).

## What the 10 files do
| File | What it does | Runs |
|---|---|---|
| `Code.gs` | Reads job mail, labels it, classifies it (rejection / offer / interview / task / confirmation / viewed / sent), updates the applications and events tabs, turns interviews and tasks into Google Calendar alerts and one Google Tasks item, parses LinkedIn job alerts into new jobs, sends the digest mail (to the user only) | every hour; summary every day 18:00 |
| `Api.gs` | The private web API the site's dashboard and Nika read and write through (token protected), including saving the tailored CV file to Drive (folder "קורות חיים שנשלחו") and linking it to the application | on request |
| `Shared.gs` | Gemini calls with a daily budget (40) and a fallback model, the "פרופיל" tab (`profile_()`, `setupProfile`), `CODE_VERSION`, phone alerts as calendar events | — |
| `Watchdog.gs` | Checks that the hourly run really ran; raises a calendar alert if it stopped; weekly Sheet backup to Drive | every 3 hours |
| `Leads.gs` | Gemini scores new jobs against the user's target roles into "משרות מומלצות" | with the feed |
| `Prep.gs` | An interview-prep page per upcoming interview, and follow-up DRAFTS (never sent) | with the feed |
| `Visitors.gs` | Site activity alerts (CV downloads, contact clicks) and `setupAll`, the one-time setup | with the feed |
| `Telegram.gs` | Optional: alerts in the user's own Telegram chat (free, their own bot), a morning brief at 08:00, the evening summary at 18:00 and a weekly summary on Friday with "what works" (which role types and channels move forward, computed in code). The summary email is marked unread and important, because mail you send yourself arrives silently | 08:00, 18:00, Friday |
| `Lifecycle.gs` | Keeps applications current: ✓ on an interview task in Google Tasks → "היה ראיון, מחכים לעדכון"; a follow-up sent in the thread → marked sent; 45 days without news → archived (a new company mail brings it back) | with the feed |
| `Push.gs` | Tells the site the moment the hourly run is done (Nika's instant alerts, the open dashboard refreshes), interview dates for those alerts, and Nika's reminders as Google Tasks | end of every run |

Nothing in them sends email to anyone except the user's own digest, and nothing deletes or archives mail.

## 0. What Claude prepares first
1. Create an empty Google Sheet with the Google Drive connector (title e.g. "Job Feed"). Its ID is the long part of the URL between `/d/` and `/edit`.
2. Copy `assets/apps-script/` and fill every `{{PLACEHOLDER}}` (search for `{{`). All facts come from the CV, the profile and the personality questionnaire, never invented:

| Placeholder | Value |
|---|---|
| `SHEET_ID` | the Sheet's ID |
| `SITE_URL` | the user's site address (section 5f), or their dashboard link if there is no site |
| `NAME_EN`, `NAME_HE`, `FIRST_NAME_EN`, `PHONE` | from the profile (the phone appears only in the prep page for the user) |
| `CITY`, `STUDIES_LINE`, `EXPERIENCE_LINE`, `PROJECTS_LINE`, `TOOLS_LINE`, `TARGET_ROLES`, `AREAS`, `WORK_PREFERENCES` | `Shared.gs` profile, one short English line each |
| `STORY_CONTEXT`, `STORY_1..3`, `STRENGTHS`, `WEAKNESS`, `VALUES`, `FIVE_YEARS` | `Prep.gs`, from the personality questionnaire: the user's real stories for STAR answers |
| `ONE_LINE_ABOUT_EN` | one true sentence about the user's background, used in follow-up drafts |
| `OPEN_TO_ROLES_EN`, `NOT_FIT_ROLES_EN`, `HANDS_ON_EXPERIENCE_EN`, `MAX_YEARS_DEMANDED`, `LOCATION_RULE_EN`, `ADDRESS_FORMS_HE` | `profileDefaults_` in `Shared.gs`: the defaults of the "פרופיל" tab (other roles that are also a fit, roles that never are, hands-on experience, the years of experience a job may not demand, the location rule for scoring jobs, how Nika addresses the user). Run `setupProfile` once to create the tab with these values; from then on the user edits facts there, and only rows marked public = TRUE may reach the site's public chat |
| `TARGET_ROLES_REGEX` | the target roles as one regex on job titles, English and Hebrew (an example is in the comment above it) |
| `SKIP_TITLE_WORDS_REGEX` | words in a job title that mean "not for me" (languages or areas the user does not know), or `^$` for none |
| `BLOCKED_COMPANIES_REGEX` | companies that must never be tracked (for example the user's current employer), or `^$` for none |

   Also check `SENDERS` and `known` in `Code.gs` (job-mail domains; add the companies the user applies to directly) and `TASK_LIST` (the Google Tasks list name; create that list in Google Tasks).
3. Keep the filled files in one folder named `apps-script/`, next to `scripts/` (copy `assets/scripts/` too): route A pushes that folder as it is.

## 1. Create the project (the user, once)
1. Open **https://script.google.com** → **New project** (פרויקט חדש), rename it "Job Feed".
2. **Services** (שירותים, left panel) → **+** → **Google Tasks API** → **Add**.
3. **Project Settings** (⚙️ הגדרות הפרויקט) → Time zone = the user's.
4. Put the 10 files in: route A or route B below.
5. **Project Settings** → **Script Properties**:
   - `GEMINI_KEY` = a Gemini key used only by this script (`references/gemini-setup.md`, step 3). Optional: without it the AI steps are skipped quietly.
   - `FEED_TOKEN` = a long random string (only if there is a site; the same value goes into the site's `FEED_TOKEN` secret).

### Route A — all files in one command (recommended; needs Node.js)
1. The user, once: **https://script.google.com/home/usersettings** → **Google Apps Script API** → **On**.
2. The user, once: `npx @google/clasp@3.4.1 login` → a browser window → the same Google account as the Sheet → **Allow**.
   (clasp saves the login in the user's home folder; it is a credential: never open or copy it.)
3. The script ID: **Project Settings** → **IDs** → **Script ID** (the user copies it to Claude; it is not a secret).
4. `node scripts/gs-sync.mjs setup <SCRIPT_ID>` → it links the folder and copies the project's settings.
5. `node scripts/gs-sync.mjs push` → it runs the version check and the tests, then pushes all 10 files.
   ✅ "pushed 10 files". Open the editor and refresh: the 10 files are there (`Code`, `Api`, `Shared`, …).
Every later update is the same `push` (it also moves the web app to the new code once it exists). Errors: `references/updating.md`.

### Route B — copy and paste
1. Claude hands each file in one piece (as a file, or copied to the clipboard), one at a time, with its **second line**
   so the user can check the tab.
2. The first file is `Code.gs`: delete the sample code in the existing file, paste, **Save** (Ctrl+S).
3. For each other file: **+** next to "Files" (קבצים) → **Script** (סקריפט), type the name without `.gs`, paste, save.
   The 10 names: `Code`, `Api`, `Shared`, `Watchdog`, `Leads`, `Prep`, `Visitors`, `Telegram`, `Lifecycle`, `Push`.
   Pasting into the wrong tab is the most common mistake: check the second line of each tab.

### Telegram (optional, free)
1. In Telegram, open **@BotFather** → `/newbot` → a name and a username. BotFather replies with the bot token. (If the user already has a bot, reuse its token.)
2. Send the new bot any message, then open `https://api.telegram.org/bot<TOKEN>/getUpdates` in the browser: the number after `"chat":{"id":` is the chat id.
3. Script Properties: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. The user types both, never in chat.
4. Run **`setupTelegram`**: it sets 08:00 and 18:00 and sends a test message. The script only sends (it never reads the chat), so it can share a bot that also runs its own commands.

## 2. Run the setup once and approve
1. Choose **`setupApi`** next to **Run** and press **Run**. Google asks for permission: **Review permissions** → the account → "Google hasn't verified this app" → **Advanced** → **Go to Job Feed (unsafe)** → **Allow**. This warning appears for every personal script; it is the user's own code in their own account. `setupApi` creates `API_TOKEN` in Script Properties (never shown in the log).
2. Open the `Shared` file, choose **`setupProfile`** and press **Run**: it creates the "פרופיל" tab with the user's facts (target roles, areas, rules, stories, how Nika addresses them). It never overwrites an existing tab. From now on facts change there, not in the code. The Run list shows only the functions of the file that is open: `setupProfile` is in `Shared`, `setupAll` in `Visitors`.
3. Open `Visitors`, choose **`setupAll`** and press **Run**. It creates the hourly run, the digest and the watchdog, runs everything once, and prints a ✅ / ❌ list of what is ready and what is missing. Fix every ❌ and run `setupAll` again (it never makes duplicates).
4. Only if there is a site (section 5f): **Deploy** → **New deployment** → type **Web app**, Execute as **Me**, Who has access **Anyone** → **Deploy**. Copy the URL ending in `/exec`: it becomes the site's `APPS_SCRIPT_URL` secret, and `API_TOKEN` becomes its `APPS_SCRIPT_TOKEN`. The user copies both themselves (Project Settings → Script Properties) and types them into `wrangler secret put`, never in chat. "Anyone" is safe: every request needs the token.

Only functions without a trailing underscore appear in the Run list. Names ending in `_` are private helpers and cannot be run from the editor; that is on purpose.

## 3. Check that it works
- **Executions** (list icon) shows every run, its time and any error.
- The Sheet fills up after the first run; the `סטטוס` tab shows the last run time.
- To run it now instead of waiting an hour, choose `runFeed` → **Run**.

## 4. Updating the code later
Full guide: `references/updating.md`. In short:
- **Route A:** `node scripts/gs-sync.mjs push` — every file, the tests first, and the web app moves to the new code.
- **Route B:** Claude hands each changed file with its second line; the user opens the right tab, selects all (Ctrl+A),
  pastes, saves. If `Api.gs` changed: **Deploy** → **Manage deployments** → ✏️ → Version **New version** → **Deploy**
  (the URL stays the same).
- Triggers stay either way. When the site and Apps Script run different code versions, Nika says which one is behind.
- To confirm what is really in the project, Claude can export it with the Google Drive connector (`download_file_content` on the script's file id with export type `application/vnd.google-apps.script+json`) and compare it with the local copy.

## 5. Troubleshooting
| What you see | Fix |
|---|---|
| "Exception: You do not have permission to call …" | Run `setupAll` again and approve the new permission (new code asked for a new service) |
| "ReferenceError: Tasks is not defined" | Add **Google Tasks API** under **Services** |
| "Exception: Service invoked too many times for one day" | A daily Google quota ran out; it resets the next day |
| A function is missing from the Run list | Its name ends in `_` (private), or a file has a syntax error: check the red marks |
| "Exceeded maximum execution time" | Each run may last 6 minutes; the feed continues next hour |
| The Sheet stays empty | Check Executions; confirm `SHEET_ID` and that the script's account can open the Sheet |
| The site's dashboard says the data is unavailable | `APPS_SCRIPT_URL` must end in `/exec`, the token must match `API_TOKEN`, and the web app must be deployed again after `Api.gs` changed |
| Two copies of every row | Two `runFeed` triggers: delete one under **Triggers** |
| `setupProfile` / `setupAll` not in the Run list | The list shows the open file's functions only: open `Shared` (setupProfile) or `Visitors` (setupAll) |
| Nika: "⚠️ קוד ה-Apps Script מאחור" | Not every file was updated, or the web app still runs old code: push again (`references/updating.md`) |
| Executions: "push: …" warnings | The site address in `FEED_SITE` (Visitors.gs) is wrong, or the site's `APPS_SCRIPT_TOKEN` ≠ `API_TOKEN`; the feed itself is fine |

## 6. Stopping it
**Triggers** (clock icon) → the three dots on each trigger → **Delete trigger**. Nothing runs after that; the Sheet and the code stay.

## Safety
The feed reads mail, labels threads and writes to the user's own Sheet, Calendar, Tasks and Drive (backups and the CV copies). It never sends email (except the digest to the user), never deletes or archives, and strips phone numbers from stored mail text. Script Properties hold the only secrets (`GEMINI_KEY`, `API_TOKEN`, `FEED_TOKEN`).
