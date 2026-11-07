# Running Google Apps Script (Job Feed) — full guide

The Job Feed (`assets/apps-script/`, section 5e) runs on Google's servers every hour, for free, even when the computer is off and when Claude's usage has run out. Claude prepares the code; the user pastes it and approves it once. Claude cannot press buttons in the Apps Script editor for them.

## What the 7 files do
| File | What it does | Runs |
|---|---|---|
| `Code.gs` | Reads job mail, labels it, classifies it (rejection / offer / interview / task / confirmation / viewed / sent), updates the applications and events tabs, turns interviews and tasks into Google Calendar alerts and one Google Tasks item, parses LinkedIn job alerts into new jobs, sends the digest mail (to the user only) | every hour; digest Sun/Tue/Thu 18:00 |
| `Api.gs` | The private web API the site's dashboard reads and writes through (token protected) | on request |
| `Shared.gs` | Gemini calls with a daily budget (40) and a fallback model, the user's short profile for prompts, phone alerts as calendar events | — |
| `Watchdog.gs` | Checks that the hourly run really ran; raises a calendar alert if it stopped; weekly Sheet backup to Drive | every 3 hours |
| `Leads.gs` | Gemini scores new jobs against the user's target roles into "משרות מומלצות" | with the feed |
| `Prep.gs` | An interview-prep page per upcoming interview, and follow-up DRAFTS (never sent) | with the feed |
| `Visitors.gs` | Site activity alerts (CV downloads, contact clicks) and `setupAll`, the one-time setup | with the feed |

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
| `TARGET_ROLES_REGEX` | the target roles as one regex on job titles, English and Hebrew (an example is in the comment above it) |
| `SKIP_TITLE_WORDS_REGEX` | words in a job title that mean "not for me" (languages or areas the user does not know), or `^$` for none |
| `BLOCKED_COMPANIES_REGEX` | companies that must never be tracked (for example the user's current employer), or `^$` for none |

   Also check `SENDERS` and `known` in `Code.gs` (job-mail domains; add the companies the user applies to directly) and `TASK_LIST` (the Google Tasks list name; create that list in Google Tasks).
3. Give the user each file in one piece (as a file, or copied to their clipboard), one at a time, and tell them its first two lines so they can check they pasted it into the right tab.

## 1. Create the project (the user, once)
1. Open **https://script.google.com** → **New project**, rename it "Job Feed".
2. The first file is `Code.gs`: delete the sample code, paste `Code.gs`, **Save** (Ctrl+S).
3. For each other file: **+** next to "Files" → **Script**, type the name without `.gs` (`Api`, `Shared`, `Watchdog`, `Leads`, `Prep`, `Visitors`), paste, save. Pasting into the wrong tab is the most common mistake; check the first lines of each tab.
4. **Services** (left panel) → **+** → **Google Tasks API** → **Add**.
5. **Project Settings** (gear) → Time zone = the user's, then **Script Properties**:
   - `GEMINI_KEY` = a Gemini key used only by this script (`references/gemini-setup.md`, step 3). Optional: without it the AI steps are skipped quietly.
   - `FEED_TOKEN` = a long random string (only if there is a site; the same value goes into the site's `FEED_TOKEN` secret).

## 2. Run the setup once and approve
1. Choose **`setupApi`** next to **Run** and press **Run**. Google asks for permission: **Review permissions** → the account → "Google hasn't verified this app" → **Advanced** → **Go to Job Feed (unsafe)** → **Allow**. This warning appears for every personal script; it is the user's own code in their own account. `setupApi` creates `API_TOKEN` in Script Properties (never shown in the log).
2. Choose **`setupAll`** and press **Run**. It creates the hourly run, the digest and the watchdog, runs everything once, and prints a ✅ / ❌ list of what is ready and what is missing. Fix every ❌ and run `setupAll` again (it never makes duplicates).
3. Only if there is a site (section 5f): **Deploy** → **New deployment** → type **Web app**, Execute as **Me**, Who has access **Anyone** → **Deploy**. Copy the URL ending in `/exec`: it becomes the site's `APPS_SCRIPT_URL` secret, and `API_TOKEN` becomes its `APPS_SCRIPT_TOKEN`. The user copies both themselves (Project Settings → Script Properties) and types them into `wrangler secret put`, never in chat. "Anyone" is safe: every request needs the token.

Only functions without a trailing underscore appear in the Run list. Names ending in `_` are private helpers and cannot be run from the editor; that is on purpose.

## 3. Check that it works
- **Executions** (list icon) shows every run, its time and any error.
- The Sheet fills up after the first run; the `סטטוס` tab shows the last run time.
- To run it now instead of waiting an hour, choose `runFeed` → **Run**.

## 4. Updating the code later
1. Claude edits the file and hands over the whole new version, with its first two lines.
2. The user opens the right tab, selects all (Ctrl+A), pastes, saves.
3. Triggers stay. If there is a web app, **Deploy** → **Manage deployments** → edit (pencil) → Version **New version** → **Deploy**, so the site gets the new `Api.gs`; the URL stays the same.
4. To confirm what is really in the project, Claude can export it with the Google Drive connector (`download_file_content` on the script's file id with export type `application/vnd.google-apps.script+json`) and compare it with the local copy.

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

## 6. Stopping it
**Triggers** (clock icon) → the three dots on each trigger → **Delete trigger**. Nothing runs after that; the Sheet and the code stay.

## Safety
The feed reads mail, labels threads and writes to the user's own Sheet, Calendar and Tasks. It never sends email (except the digest to the user), never deletes or archives, and strips phone numbers from stored mail text. Script Properties hold the only secrets (`GEMINI_KEY`, `API_TOKEN`, `FEED_TOKEN`).
