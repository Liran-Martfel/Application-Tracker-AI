# Personal recruiter site — build guide (section 5f)

This guide is phase 5 (and 6, Nika) of `references/setup-roadmap.md`. Start there for the whole order and the checks.

A free personal site on Cloudflare Workers, the same system the skill's author runs for their own job search:
- **Public page**: photo, contact buttons, CV downloads, a project carousel, an AI chat that answers recruiters in the user's own voice from a knowledge base (RAG), experience and skills, Hebrew and English.
- **Private area** (`/app`, password): the job-search dashboard (applications, replies, follow-ups, recommended jobs, KPIs, data audit) that refreshes by itself when the hourly run finds something, Nika's chat (the same assistant and conversation as on Telegram), interview practice, a CV file tailored to each job, and anonymous visitor stats.
- **CV file per job** ("קובץ קורות חיים למשרה"): one Gemini call edits the user's own CV for the chosen job — edit, don't rewrite: at most 8 changed lines, no new facts (checked in code), projects before experience, one page — then a code-side linter rejects phrases that read as AI-written and sends them back once. The user reviews only the changed lines, unticks what they don't want, and downloads a PDF (the browser's "Save as PDF", real text for ATS) or a Word file (built in the browser). A Word copy goes to Drive ("קורות חיים שנשלחו") and is linked to the application.
- **Behind it**: the Job Feed in Google Apps Script (`references/apps-script-setup.md`) is the data store the dashboard reads and writes.

Template: `assets/site/`. It holds no personal data: everything personal is a `{{PLACEHOLDER}}`.

## What is already built in (keep it)
- **Security**: strict Content Security Policy (all scripts in `public/js/*.js`, the private ones served only to the signed-in owner), signed session cookie, login lockout (5 wrong passwords block an address for 24 hours; raise `LOGIN_LOCK_VERSION` in `wrangler.toml` and deploy to clear all blocks), per-IP rate limits, private data never put in a shared cache, tokens only in headers or POST bodies, phone numbers other than the owner's removed from chat answers.
- **Chat reliability**: Gemini 2.5 Flash, then Gemini Flash Lite on quota errors, then a free Cloudflare Workers AI model (Llama 3.3 70B, then Gemma 4) when Gemini is unavailable. Keyword search replaces the embeddings when they fail.
- **Privacy**: visitor stats keep no IP addresses, are deleted after 90 days, and never count the owner (a device that signed in once is never counted; "delete my visits from this device" in the stats).
- **Free demos stay awake**: `DEMOS` in `src/index.js` + the cron in `wrangler.toml` wake free Render apps every 10 minutes in work hours (delete both if there are none).

## Optional: Nika, a job-search assistant on Telegram and in the dashboard
`src/nika.js` answers the owner from the same job-search data as the dashboard: "what is waiting for me?", "they called from X, an interview on Tuesday", "I just applied to Y", follow-up drafts, interview prep and practice, reminders at an exact time. Every change is a button the owner presses first; she never sends email (Gmail drafts only) and never deletes. Only the owner's chat is answered, Telegram must send the secret header, the same update is answered once, and `/status` works without the model.
- **One assistant, two places:** the dashboard chat (`src/nika-web.js`, `POST /api/private/nika`, signed in only) runs the same core (`converse` / `decide` in nika.js), so the conversation and the approval buttons are shared. "שיחה חדשה" clears both.
- **Question or change? (`src/intent.js`):** a small classifier decides whether a message reports something or asks for a change (only then may Nika propose a button) or is a question, chat or practice (an answer, never a button): BGE-M3 sentence embeddings on Workers AI (free, Hebrew and English, no Gemini) + k-nearest-neighbour vote against ~90 labelled example sentences; a close call falls back to a keyword rule. Teach it by adding examples. Check it against the real model: `npx wrangler dev -c scripts/intent-eval/wrangler.toml --port 8891` then `node scripts/intent-eval/run.mjs` (40 unseen sentences; keywords alone ~75%, the classifier with the fallback ~100%).
- **Voice:** a voice message on Telegram is transcribed by Whisper on Workers AI (free, no Gemini) and echoed back ("🎙️ שמעתי: …") before Nika answers. Up to 3 minutes.
- **Instant alerts:** at the end of every hourly run Apps Script calls `POST /api/push` (`src/push.js`; a push key derived from the shared token, hex HMAC-SHA256 over "push", in a header, never the token itself). The site reads the fresh data and Nika announces, from fixed texts (no model), an interview invite, a rejection, a new interview date or a strong job — each once.
- **Reminders in Google Tasks:** an approved reminder is also a task in the job-search list; ticking ✓ there before the time cancels the Telegram message.
- **Versions:** `src/version.js` and `Shared.gs` carry the same `CODE_VERSION`; when they differ Nika says which side is behind, and once a day the site checks the template for a newer version (`references/updating.md`).
1. Create a bot with **@BotFather** (`/newbot`), send it one message, and read the chat id from `https://api.telegram.org/bot<TOKEN>/getUpdates`.
2. The owner sets two secrets: `npx wrangler secret put TELEGRAM_BOT_TOKEN` and `npx wrangler secret put TELEGRAM_CHAT_ID` (the webhook secret is derived from `SESSION_SECRET`). Deploy.
3. Signed in to the site, open Nika's chat in the dashboard → ⚙ settings → press **חיבור הבוט בטלגרם** once: it points the bot at the site, sets the command menu, and Nika says hello. (It is a same-origin POST from the dashboard; opening the address as a link does nothing. After changing `SESSION_SECRET`, press it again: the webhook secret is derived from it.)
4. Fill `ADDRESS_FORMS_HE` (how Nika addresses the owner in Hebrew, one full sentence, e.g. `דנה היא אישה. פני אליה תמיד בלשון נקבה: "את", "הגשת", "תרצי", "מחכה לך".`; it is also sent with every message, because the light model keeps it better that way) and `INTERVIEW_STORIES_HE` (the owner's true stories for interview prep) in `src/nika.js`. Once the "פרופיל" tab exists, its rows `פנייה` and `סיפורים לראיון` win over these defaults.

Tests: see step 5 (the mock includes a fake Telegram API and a fake speech-to-text). The Telegram alerts from Apps Script (`Telegram.gs`) use the same bot.

## What the user needs (free)
- A Cloudflare account (dash.cloudflare.com, no card). The site lives at `<worker-name>.<account-subdomain>.workers.dev`.
- Node.js 20+ and a terminal (Claude Code runs the commands).
- A Gemini API key: `references/gemini-setup.md`.
- The Job Feed set up first (`references/apps-script-setup.md`), with the web app deployed.
- Their CV, a photo or three (square, ~280px), and links to their projects.

## Steps
1. **Questionnaires.** `references/site-design-questionnaire.md` and `references/personality-questionnaire.md`. Both can be skipped and done later.
2. **Copy the template** into one new folder (a PRIVATE git repo if they want one: the code holds their email and phone, so it never goes in a public repo), keeping the three parts side by side — the tools rely on it:
   ```
   my-job-search/
     site/          ← assets/site
     apps-script/   ← assets/apps-script (the filled Job Feed files)
     scripts/       ← assets/scripts (gs-sync.mjs, check-version.mjs)
   ```
   Run `npm install` inside `site/`.
3. **Fill every `{{…}}`** (search the folder for `{{`; nothing may be left):

| Where | Placeholders | From |
|---|---|---|
| everywhere | `NAME_EN`, `NAME_HE`, `FIRST_NAME_EN`, `FIRST_NAME_HE`, `INITIALS`, `EMAIL`, `EMAIL_URLENCODED` (@ → %40), `PHONE`, `PHONE_INTL` (digits with country code, no +), `PHONE_LAST9`, `GITHUB_URL`, `SITE_URL` | profile; only contact details the user agreed to show |
| `public/index.html` | `HEADLINE_EN`, `META_DESCRIPTION_EN`, `TAGLINE_EN`, `TOP_SKILLS` (3 key skills), `LOOKING_FOR_EN`, `WHERE_EN`, `PROJECTS_HINT_EN` | CV + profile |
| `public/js/site-1.js` | `TAGLINE_*`, `LOOKING_FOR_*`, `WHERE_*`, `PROJECTS_HINT_*`, `CHIP_1..4_*` (4 ready questions to the user, "Which tools do you use?"), and the `PROJECTS`, `EXP`, `SKILLS` lists (copy the example object once per item) | see "Content rules" |
| `src/index.js` | `HEBREW_FIRST_PERSON_RULE`: the user's own Hebrew forms, e.g. `In Hebrew use feminine first-person forms ("בניתי", "אני מחפשת").` (or masculine, or neutral wording); `DEMO_URLS` comment → the `DEMOS` list | profile |
| `src/index.js` | `PROJECT_1_NAME`, `PROJECT_1_MATCH_REGEX`, `PROJECT_1_LIVE_URL`, `PROJECT_1_GITHUB_URL` in `PROJECT_LINKS`: one row per project. When a question or an answer names a project, the chat shows buttons to its live demo and code. The links come only from this list, never from the model | the same projects as on the page |
| `public/js/app-4.js` | `FOLLOWUP_LINE_HE` / `FOLLOWUP_LINE_EN`: one true sentence about the user's background for the follow-up drafts, ending with a period (e.g. `I'm a data analyst with 3 years of SQL and Python work.`); no invented facts | CV |
| `public/js/app-8.js` | `AGENT_PROFILE_HE`: one Hebrew line about the user for the dashboard agent | CV |
| `wrangler.toml`, `package.json` | `WORKER_NAME` (lowercase, dashes) | the user's choice |
| `public/cv/` | `CV_FILE_PREFIX` + `HE.pdf` / `EN.pdf`, e.g. `Dana-Levi-CV-HE.pdf` | the user's CV files |

   Images: `public/profile-1.jpg` (and `-2`, `-3`; they rotate), `public/apple-touch-icon.png` (180×180), `public/og.png` (1200×630 link preview). Without photos, delete the `<img>` tags and the initials show. Colours: the tokens at the top of `public/index.html`, `public/app.html` and `public/login.html` (`:root`), from the design questionnaire.
4. **Fill the knowledge** (`knowledge/*.md`), which is all the chat knows:
   - `profile.md` from the CV and profile; `experience.md` from the CV; `personality.md` from the questionnaire.
   - `projects.md`: for each project, read its README and any journal or log in the repo, and write four sections whose headings all carry the project name: overview, how it was built, challenges and how they were solved, results and lessons. Only facts from those sources; numbers exactly as written.
   - Each heading becomes one passage, so a heading must make sense alone ("Weather App: challenges", not "Challenges").
   - Never mention who wrote a repo's notes (for example an AI assistant); write what the user did. Leave out visitor tracking, private areas and internal plumbing.
   - Show the user the knowledge files and get their OK.
5. **Test locally** (all checks must pass):
   ```
   npm run build                                   # knowledge → passages
   node ../scripts/check-version.mjs               # the site and Apps Script carry the same CODE_VERSION
   MOCK_PORT=8788 node test/mock-server.mjs        # fake Gemini, Apps Script, Telegram and speech-to-text (second terminal)
   npx wrangler dev --test-scheduled --port 8787 --var APPS_SCRIPT_URL:http://127.0.0.1:8788/exec --var APPS_SCRIPT_TOKEN:test-token --var FEED_TOKEN:test-feed-token --var GEMINI_API_KEY:test-key --var GEMINI_BASE:http://127.0.0.1:8788 --var ADMIN_PASSWORD:correct-horse --var SESSION_SECRET:local-test --var TELEGRAM_API:http://127.0.0.1:8788/tg/bot --var TELEGRAM_BOT_TOKEN:t --var TELEGRAM_CHAT_ID:42 --var TELEGRAM_WEBHOOK_SECRET:s3cr3t --var STT_TEST_URL:http://127.0.0.1:8788/stt --var EMBED_TEST_URL:http://127.0.0.1:8788/embed --var TEST_HOOKS:1
   BASE=http://127.0.0.1:8787 node test/e2e.cjs     # about 260 checks, light and dark, desktop and phone
   ```
   `TEST_HOOKS:1` is what lets the fake services (GEMINI_BASE, TELEGRAM_API, STT_TEST_URL, EMBED_TEST_URL, the fixed TELEGRAM_WEBHOOK_SECRET) work, and only with a local http address: never set it on the live site.
   Restart the mock before each suite (its log is shared). The test password is `correct-horse` (only for the local
   test). Then look at the screenshots in `test/shots/` at 1280px and 390px.
6. **Deploy (the user approves every deploy)**: the user runs `npx wrangler login`, then sets the secrets themselves, typing them, never in chat:
   ```
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put APPS_SCRIPT_URL      # the Job Feed web app URL, ending in /exec
   npx wrangler secret put APPS_SCRIPT_TOKEN    # API_TOKEN from the script's Script Properties
   npx wrangler secret put FEED_TOKEN           # the same value as FEED_TOKEN in Script Properties
   npx wrangler secret put ADMIN_PASSWORD       # the private-area password, chosen by the user
   npx wrangler secret put SESSION_SECRET       # any long random string
   ```
   and `npm run deploy`. Check the live page, ask the chat two questions (one about tools, one "am I talking to you or a bot?"), sign in at `/app` and see the applications load.
7. **Hand over**: the address, how to sign in (the lock at the bottom, "remember me"), and how to remove their own test visits. Put the address in `SITE_URL` of the Apps Script files too.

## Content rules (they decide how good the site feels)
- **First person everywhere**, headings included ("My projects"). In Hebrew, the user's own gender forms.
- **Plain sentences**: no colons, semicolons or em dashes in visible text.
- **Projects, ordered by fit to the target roles**, strongest first; no two similar projects in a row; projects with a live demo early. Add "this website" as a project when the target roles are AI, solutions or integration.
- **Each card**: a kind label, ONE true key result (a number when there is one), two short paragraphs (what and how; one decision or challenge and the result), links, and "Ask about it" with a ready question the knowledge can answer.
- **Experience**: one or two first-person sentences per role, with a real result.
- **Skills**: grouped, only tools the user really used.
- **The chat** never mentions skills the user lacks unless asked about that exact skill, mentions every role the user is open to, and says honestly that it is an AI assistant when asked.

## Optional: a nicer free address
To get e.g. `portfolio.<account>.workers.dev` without breaking old links or losing stats: deploy a second tiny Worker named `portfolio` whose only code is `export default { fetch: (req, env) => env.SITE.fetch(req) }`, with `[[services]] binding = "SITE", service = "<main worker name>"` in its wrangler.toml. Update `SITE_URL` to the new address.

## Updating later
Change the knowledge or the page → run the tests → the user approves → `npm run deploy`. A hard refresh (Ctrl+Shift+R) shows the new version at once. A change both halves depend on → raise `CODE_VERSION` on both sides; new template versions → `references/updating.md`.

## Lessons from building the first one
- Test browsers report "HeadlessChrome", which the stats skip as a bot: give test contexts a normal user agent when checking stats.
- On Windows PowerShell 5.1, `git commit -m` breaks on quotes: write the message to a file and use `git commit -F`.
- An old `wrangler dev` left running keeps its port: start the test server on a fresh port instead of stopping processes you did not start.
- Keep the public page one centered column on desktop too; multi-column layouts read as clutter to recruiters.
- Paste Apps Script files one at a time and check the first lines of each tab: pasting into the wrong tab is the most common mistake.
