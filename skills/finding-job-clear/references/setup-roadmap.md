# Setup roadmap — START HERE

This is the order in which the whole system is set up, from nothing to everything working. Claude follows it phase by
phase and guides the user through every step. Each phase says **what the user gets**, **how long it takes**, **what is
needed**, **the exact steps**, **how to know it worked** and **what to do if it didn't**.

## How Claude guides (rules for every phase)
1. **Ask what they want first** (one AskUserQuestion with the packages from "What can be chosen" below, the recommended
   one first), explain any dependency in one line, then build only that path. The recommended package is the author's
   own system: **it runs without Claude** (Google Apps Script, Cloudflare, Gemini's free tier, Workers AI). Claude is
   only the installer and the one who updates it; when the user's Claude usage runs out, nothing stops.
2. **One phase at a time, one step at a time.** Before a phase: one line on what it gives them and how long it takes.
   During it: numbered steps with the exact button names (Hebrew UI names in parentheses when the user writes Hebrew).
   After it: run its **✅ check** together and show the result. Never start the next phase before the check passes.
3. **Keep a progress file** in the user's folder: `my-job-search/setup.json` =
   `{ "want": [...], "done": { "<phase id>": "<YYYY-MM-DD>" }, "profile": { the answers from "The profile" below }, "notes": "" }`
   (when a Claude dashboard exists, mirror it in `profile.setup` too). It holds no secrets, ever. Update it after every
   passed check. At the start of every session, read it; if `want` has phases not in `done`, say in one line where they
   stopped and offer to continue ("נשארו 2 שלבים: טלגרם והאתר. להמשיך?").
4. **Show the checklist** at the start and after each phase, like this:
   `✅ 0 פרופיל · ✅ 2 Job Feed · ⏳ 3 Gemini · ⬜ 4 טלגרם · ⬜ 5 אתר · ⬜ 6 ניקה · ⬜ 7 בדיקה`
5. **The user does what touches their accounts and secrets**: signing in, approving Google permissions, creating
   bots and keys, typing every secret (never in chat, never into a file Claude reads). Claude prepares files,
   explains each click, runs local commands and tests, and verifies.
6. **Every deploy and every publish needs the user's explicit OK in that turn.**
7. When something fails: read the error, find it in the phase's **❌ table** or in the troubleshooting of the linked
   guide, fix, and run the check again. Never skip a check to "come back later".

## The phases at a glance
| # | Phase | The user gets | Time | Needs |
|---|---|---|---|---|
| 0 | The profile | the facts every part uses (asked once) | 10 min | their CV |
| 1 | Dashboard in Claude (optional) | a tracker inside Claude, updated when Claude runs | 10 min | Gmail connector |
| 2 | Job Feed (Apps Script) | updates every hour without Claude, calendar alerts, a Sheet with all the data | 30 min | Google account, Node.js for route A |
| 3 | Gemini key | job scoring, prep pages, the site's chat | 5 min | Google account |
| 4 | Telegram alerts | morning brief, evening summary, weekly "what works" | 10 min | Telegram |
| 5 | Personal site | public page with an AI chat, private dashboard, CV file per job | 1–2 h | Cloudflare account (free), Node.js |
| 6 | Nika | a Telegram + dashboard assistant: questions, updates, reminders, voice, instant alerts | 10 min | phases 2, 4, 5 |
| 7 | Final check | everything verified end to end | 10 min | — |

## Before you start (the person installing, once)
Show this list first and check each item together; stop at the first one missing and walk them through it.
| What | Why | How (free unless said) |
|---|---|---|
| **A Claude account** with skills | it installs and updates the system | claude.ai. A paid plan is recommended for long setup sessions |
| **Claude Code** (the desktop app, or the VS Code extension) | the setup runs commands on the computer (tests, deploys, `gs-sync`) | claude.ai/download → install → sign in. In the app: open a folder (e.g. `Documents\my-job-search`) |
| **Node.js 20 or newer** | the site and the one-command Apps Script update | nodejs.org → "LTS" → install with the defaults → reopen Claude Code. Check: `node -v` |
| **This skill** | the guide and all the code | download `dist/finding-job-clear.zip` from the GitHub page → unzip into `~/.claude/skills/finding-job-clear` (Windows: `C:\Users\<you>\.claude\skills\finding-job-clear`) → restart Claude Code. In claude.ai: Settings → Capabilities/Skills → upload the zip |
| **A Google account** (Gmail) | the Job Feed, the Sheet, the calendar alerts | the one they use for job applications |
| **Their CV** (PDF or Word) | phase 0 | — |
| Telegram (for phases 4 and 6) | alerts and Nika | the app on the phone |
| A Cloudflare account (for phase 5) | the site | dash.cloudflare.com → Sign up (no card) |
Then they write to Claude: **"תקים לי מעקב חיפוש עבודה"** (or "set up my job tracker").

## Total time
| Package | Hands-on time | Notes |
|---|---|---|
| The full system, like the author's | **about 2.5–3.5 hours** | phase 0 (10 min), 2 (30), 3 (5), 4 (10), 5 (1–2 h), 6 (10), 7 (10). Can be split over two days: day 1 phases 0–4, day 2 the site and Nika |
| Updates + Telegram, no site | about 1 hour | phases 0, 2, 3, 4, 7 |
| Updates only | about 50 minutes | phases 0, 2, 3, 7 |
| Dashboard in Claude only | about 20 minutes | phases 0, 1 |
Add about 30 minutes the first time if Claude Code or Node.js still has to be installed. Most of the site's time is
the content (projects, knowledge, photos), not the technical steps.

## What the user does with their own hands (everything else Claude does)
| Phase | The user |
|---|---|
| 0 | attaches the CV, answers one question round, confirms the profile |
| 2 | creates the Apps Script project, adds the Tasks service, (route A) turns on the Apps Script API and signs in to clasp once, approves Google's permission screen, runs `setupApi` / `setupProfile` / `setupAll`, (if a site is planned) deploys the web app |
| 3 | creates a Gemini key and types it into Script Properties |
| 4 | creates a bot with @BotFather, sends it one message, types the token and chat id into Script Properties, runs `setupTelegram` |
| 5 | answers the two questionnaires, approves the knowledge texts, signs in to Cloudflare (`npx wrangler login`), types each secret, says "OK" to the deploy |
| 6 | types two secrets, says "OK" to the deploy, presses "חיבור הבוט בטלגרם" once in the dashboard (Nika's ⚙ settings) |
| 7 | runs `runFeed` once, sends Nika a question and a voice message |

## What can be chosen, and what needs what
Phase 0 (the profile) always comes first; everything else is chosen. Offer these packages in the first question,
recommended first:
| Package | Phases | What they get | Needs Claude to run? |
|---|---|---|---|
| **The full system, like the author's** (recommended) | 0, 2, 3, 4, 5, 6, 7 | hourly Job Feed, calendar alerts, scored jobs, Telegram brief and summaries, a personal site with a private dashboard and a CV file per job, and Nika on Telegram and in the dashboard | **no** |
| **Updates + Telegram, no site** | 0, 2, 3, 4, 7 | the Job Feed, the Sheet as the dashboard, Telegram brief and summaries (no assistant) | no |
| **Updates only** | 0, 2, 3, 7 | the Job Feed and the Sheet, calendar alerts, the digest mail | no |
| **Dashboard in Claude only** | 0, 1 | a tracker inside Claude | yes (it updates when Claude runs) |
Dependencies: the Job Feed (2) needs only a Google account; Telegram alerts (4) need the Job Feed; the site (5) needs
the Job Feed with its web app; **Nika (6) needs the site** (she runs inside it) and a Telegram bot (4) — so "the
Telegram assistant without a site" means a site that simply is not shared with anyone. Phase 1 can be added to any
package; nothing else depends on it.

## Adding a part later
Everything is additive. When the user asks ("תוסיף לי את האתר", "אני רוצה גם את ניקה", "add the Telegram alerts"):
read `setup.json`, add the parts and their missing dependencies to `want`, say in one line what will be added and how
long it takes, and run only the missing phases with their checks. Nothing that already works is rebuilt; filled files
are reused. Removing a part: stop its triggers or its Worker, mark it in `notes`.

## Phase 0 — The profile (always first)
**Gets:** the facts every part uses, asked once. **Time:** 10 minutes.
1. Ask for their CV (PDF or Word, attached or a path). From it draft: name (Hebrew and English), email, phone (only if
   they agree to use it), city, studies, experience, projects, tools, target roles, languages.
2. One AskUserQuestion round for what the CV can't tell: target roles (edit the suggestions) and what they do NOT want,
   areas and commute, office/hybrid, the years of experience a job may not demand, companies never to track (for
   example a current employer), and **how they want to be addressed in Hebrew** (feminine, masculine or neutral: it
   becomes `ADDRESS_FORMS_HE` and the "פנייה" row).
3. Save the answers in `setup.json` → `profile`. They fill the `{{PLACEHOLDERS}}` in phases 2 and 5 and become the
   "פרופיל" tab (`setupProfile`), which is from then on the one place the facts live.
**✅ Check:** show the profile in 6–8 lines; the user confirms.

---

## Phase 1 — Dashboard in Claude (optional; only in the "Dashboard in Claude" package or when asked)
**Gets:** a tracker dashboard inside Claude, filled from Gmail. It updates only when Claude runs, so the full system
uses the site's dashboard (phase 5) or the Sheet instead. **Time:** 10 minutes.
**Steps:** SKILL.md section 1 (Onboarding): preflight, CV, one question round, alerts in one tap, then the dashboard.
**✅ Check:** the dashboard opens, "כל ההגשות" shows at least the applications found in Gmail, and the scheduled tasks
appear in `list_triggers`.
**❌ If not:** no Gmail connector → connect it first; empty table → widen the history window (profile.history_months)
and rerun the daily scan; no scheduled-task tools → say alerts run only when they ask, and continue.

## Phase 2 — Job Feed (Google Apps Script)
**Gets:** the hourly feed: job mail classified into applications and events, calendar alerts before interviews,
Google Tasks items, LinkedIn job alerts scored, a digest, a watchdog, weekly backups. Runs on Google's servers even
when the computer is off and when Claude's usage has run out. **Time:** 30 minutes.
**Full guide:** `references/apps-script-setup.md`. The short path:
1. Claude creates an empty Google Sheet (Drive connector), copies `assets/apps-script/` and `assets/scripts/` into the
   user's folder (`my-job-search/apps-script`, `my-job-search/scripts`; site-guide.md step 2 shows the layout) and fills
   every `{{PLACEHOLDER}}` (the table in apps-script-setup.md, section 0). Nothing may be left: search for `{{`.
2. The user creates the project at script.google.com (**New project**, name "Job Feed"), adds **Services → Google
   Tasks API**, and sets the time zone (**Project Settings**).
3. Getting the 10 files in — choose one:
   - **Route A, one command (recommended when Node.js is installed):** apps-script-setup.md section 1A. The user
     turns on the Apps Script API once and signs in to clasp; then `node scripts/gs-sync.mjs setup <SCRIPT_ID>` and
     `node scripts/gs-sync.mjs push` put every file in place. Every later update is the same one command.
   - **Route B, copy and paste:** apps-script-setup.md section 1B. Claude hands the files one at a time with their
     second line, the user pastes each into a tab with the right name.
4. Run once, in this order, approving Google's permission screen the first time: **`setupApi`** → **`setupProfile`**
   → **`setupAll`**. `setupAll` prints a ✅/❌ list; fix every ❌ and run it again (it never duplicates anything).
5. Only if phase 5 is planned: **Deploy → New deployment → Web app** (Execute as: Me, Who has access: Anyone).
   The URL ending in `/exec` is the site's `APPS_SCRIPT_URL`.

**✅ Check:** `setupAll` prints only ✅ (Gemini and Telegram may be ❌ until phases 3–4); run `runFeed` once →
**Executions** shows it finished; the Sheet's `סטטוס` tab shows the run time; the "פרופיל" tab has the profile rows.
**❌ If not:** see the troubleshooting table in apps-script-setup.md (permissions, Tasks service, wrong tab, quota).

## Phase 3 — Gemini key
**Gets:** job scoring against the target roles, interview-prep pages, follow-up drafts, the site's chat and Nika.
**Time:** 5 minutes. **Full guide:** `references/gemini-setup.md`.
1. The user creates a key in Google AI Studio (free tier).
2. Script Properties → `GEMINI_KEY` (for the Job Feed). For the site, the user types it into `npx wrangler secret put
   GEMINI_API_KEY` in phase 5. Two different keys are better (separate free quotas).
**✅ Check:** run `setupAll` again → the Gemini line is ✅; after the next `runFeed`, new jobs in "משרות מומלצות"
have a score and a reason.
**❌ If not:** 429 / quota → it resets daily, the script already stays under 40 calls a day; 403 → the key belongs to
another project or the API is off (gemini-setup.md).

## Phase 4 — Telegram alerts
**Gets:** a morning brief (08:00: today's interviews, replies owed, follow-ups, strong jobs, weather), an evening
summary (18:00), a weekly summary on Friday with "what works" (which role types and channels move forward).
**Time:** 10 minutes. **Steps:** apps-script-setup.md → "Telegram".
1. @BotFather → `/newbot` → the bot token. Send the bot one message; read the chat id from `getUpdates`.
2. Script Properties → `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (the user types them).
3. Run **`setupTelegram`**.
**✅ Check:** a test message arrives in Telegram within a minute.
**❌ If not:** 404 → the token is wrong or old (copy it again from @BotFather → /mybots → API Token); 400 "chat not
found" → the user has not sent the bot a message yet, or the chat id is wrong.

## Phase 5 — Personal site (optional)
**Gets:** a free site on Cloudflare Workers: a public page with projects and an AI chat that answers recruiters in the
user's voice, and a private area `/app` with the job-search dashboard, a CV file tailored to each job (PDF and Word,
a copy kept in Drive), interview practice and visitor stats. **Time:** 1–2 hours. **Full guide:** `references/site-guide.md`.
1. Design questionnaire → personality questionnaire (both can be short).
2. Copy `assets/site/`, `assets/apps-script/` and `assets/scripts/` side by side into one PRIVATE folder or repo
   (site-guide.md step 2 shows the layout), `npm install` in `site/`, fill every `{{…}}`, write the knowledge files,
   show them to the user.
3. Run the local tests (site-guide.md step 5): every suite must pass.
4. The user: `npx wrangler login`, then types each secret (`wrangler secret put …`), then OKs the deploy.
5. Put the site address in `SITE_URL` of the Apps Script files and push them again (phase 2, route A or B).
**✅ Check:** the public page opens on a phone and a computer; the chat answers "which tools do you use?"; signing in at
`/app` shows the applications from the Sheet; "קובץ קורות חיים למשרה" makes a file and a copy appears in Drive
("קורות חיים שנשלחו").
**❌ If not:** "the data is unavailable" → `APPS_SCRIPT_URL` must end in `/exec`, `APPS_SCRIPT_TOKEN` must equal the
script's `API_TOKEN`, and the web app must be deployed again after `Api.gs` changed; the chat says it is offline →
`GEMINI_API_KEY`; login blocked → wait, or raise `LOGIN_LOCK_VERSION` and deploy.

## Phase 6 — Nika (Telegram + the dashboard)
**Gets:** one assistant on Telegram and in the dashboard chat, with one shared conversation: "what is waiting for me?",
"they called from X", "I applied to Y", follow-up drafts, interview practice, reminders at an exact time (also added to
Google Tasks; ticking ✓ there cancels them), voice messages, and instant alerts the moment the hourly run finds an
interview invite, a rejection, an interview date or a strong job. Every change is a button the user presses first.
**Time:** 10 minutes. **Needs:** phases 2, 4 and 5.
1. The user sets two site secrets: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (the same bot as phase 4), then OKs a deploy.
2. Signed in to the site, open Nika's chat in the dashboard → ⚙ settings → press **חיבור הבוט בטלגרם** once.
3. Fill `ADDRESS_FORMS_HE` (how Nika addresses the user) in the "פרופיל" tab, row `פנייה`.
**✅ Check:** Nika says hello in Telegram; "/status" answers; a voice message is transcribed ("🎙️ שמעתי: …"); the
dashboard's chat shows the same conversation; after `runFeed`, no error in Executions (Push.gs reached the site).
**❌ If not:** no hello → press **חיבור הבוט בטלגרם** again in the dashboard; "Gemini isn't answering" → quota, try later or set
`NIKA_GEMINI_KEY` (a separate key); a message "⚠️ קוד ה-Apps Script מאחור" → push the Apps Script files again
(`references/updating.md`).

## Phase 7 — Final check (together, 10 minutes)
| Check | Expected |
|---|---|
| `runFeed` in the editor | finishes without errors; Executions shows it |
| The Sheet | `סטטוס` has the last run time; `פרופיל` has the rows |
| Telegram | the morning brief arrives at 08:00 the next day |
| Nika | answers a question and a voice message; a reminder for in 10 minutes arrives on time |
| The site | the public chat answers; `/app` loads the applications; a CV file downloads and a copy is in Drive |
| Versions | no "⚠️ … מאחור" message from Nika (the site and Apps Script run the same code version) |
Mark `done.final` in `setup.json` and tell the user, in 3–4 lines, what now happens by itself every hour, day and week.

## After setup
- **What runs by itself:** every hour — the Job Feed (and Nika's instant alerts); 08:00 — the morning brief; 18:00 —
  the evening summary and digest; Friday — the weekly summary with "what works"; every 3 hours — the watchdog;
  weekly — a backup of the Sheet in Drive.
- **Updating to a new version:** `references/updating.md` (Nika announces new versions once a day).
- **Changing a fact about the user** (target roles, areas, stories): edit the "פרופיל" tab; every part reads it.
