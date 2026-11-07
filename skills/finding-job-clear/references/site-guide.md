# Personal recruiter site — build guide (section 5f)

A free personal site on Cloudflare Workers, the same system the skill's author runs for their own job search:
- **Public page**: photo, contact buttons, CV downloads, a project carousel, an AI chat that answers recruiters in the user's own voice from a knowledge base (RAG), experience and skills, Hebrew and English.
- **Private area** (`/app`, password): the job-search dashboard (applications, replies, follow-ups, recommended jobs, KPIs, data audit), an agent chat and interview practice, and anonymous visitor stats.
- **Behind it**: the Job Feed in Google Apps Script (`references/apps-script-setup.md`) is the data store the dashboard reads and writes.

Template: `assets/site/`. It holds no personal data: everything personal is a `{{PLACEHOLDER}}`.

## What is already built in (keep it)
- **Security**: strict Content Security Policy (all scripts in `public/js/*.js`, the private ones served only to the signed-in owner), signed session cookie, login lockout (5 wrong passwords block an address for 24 hours; raise `LOGIN_LOCK_VERSION` in `wrangler.toml` and deploy to clear all blocks), per-IP rate limits, private data never put in a shared cache, tokens only in headers or POST bodies, phone numbers other than the owner's removed from chat answers.
- **Chat reliability**: Gemini 2.5 Flash, then Gemini Flash Lite on quota errors, then a free Cloudflare Workers AI model (Llama 3.3 70B, then Gemma 4) when Gemini is unavailable. Keyword search replaces the embeddings when they fail.
- **Privacy**: visitor stats keep no IP addresses, are deleted after 90 days, and never count the owner (a device that signed in once is never counted; "delete my visits from this device" in the stats).
- **Free demos stay awake**: `DEMOS` in `src/index.js` + the cron in `wrangler.toml` wake free Render apps every 10 minutes in work hours (delete both if there are none).

## What the user needs (free)
- A Cloudflare account (dash.cloudflare.com, no card). The site lives at `<worker-name>.<account-subdomain>.workers.dev`.
- Node.js 20+ and a terminal (Claude Code runs the commands).
- A Gemini API key: `references/gemini-setup.md`.
- The Job Feed set up first (`references/apps-script-setup.md`), with the web app deployed.
- Their CV, a photo or three (square, ~280px), and links to their projects.

## Steps
1. **Questionnaires.** `references/site-design-questionnaire.md` and `references/personality-questionnaire.md`. Both can be skipped and done later.
2. **Copy the template** into a new folder (a PRIVATE git repo if they want one: the code holds their email and phone, so it never goes in a public repo). Run `npm install`.
3. **Fill every `{{…}}`** (search the folder for `{{`; nothing may be left):

| Where | Placeholders | From |
|---|---|---|
| everywhere | `NAME_EN`, `NAME_HE`, `FIRST_NAME_EN`, `FIRST_NAME_HE`, `INITIALS`, `EMAIL`, `EMAIL_URLENCODED` (@ → %40), `PHONE`, `PHONE_INTL` (digits with country code, no +), `PHONE_LAST9`, `GITHUB_URL`, `SITE_URL` | profile; only contact details the user agreed to show |
| `public/index.html` | `HEADLINE_EN`, `META_DESCRIPTION_EN`, `TAGLINE_EN`, `TOP_SKILLS` (3 key skills), `LOOKING_FOR_EN`, `WHERE_EN`, `PROJECTS_HINT_EN` | CV + profile |
| `public/js/site-1.js` | `TAGLINE_*`, `LOOKING_FOR_*`, `WHERE_*`, `PROJECTS_HINT_*`, `CHIP_1..4_*` (4 ready questions to the user, "Which tools do you use?"), and the `PROJECTS`, `EXP`, `SKILLS` lists (copy the example object once per item) | see "Content rules" |
| `src/index.js` | `HEBREW_FIRST_PERSON_RULE`: the user's own Hebrew forms, e.g. `In Hebrew use feminine first-person forms ("בניתי", "אני מחפשת").` (or masculine, or neutral wording); `DEMO_URLS` comment → the `DEMOS` list | profile |
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
   MOCK_PORT=8788 node test/mock-server.mjs        # fake Gemini + fake Apps Script, in a second terminal
   npx wrangler dev --port 8787 --var APPS_SCRIPT_URL:http://127.0.0.1:8788/exec --var APPS_SCRIPT_TOKEN:test-token --var FEED_TOKEN:test-feed-token --var GEMINI_API_KEY:test-key --var GEMINI_BASE:http://127.0.0.1:8788 --var ADMIN_PASSWORD:correct-horse --var SESSION_SECRET:local-test
   BASE=http://127.0.0.1:8787 node test/e2e.cjs     # about 220 checks, light and dark, desktop and phone
   ```
   The test password is `correct-horse` (only for the local test). Then look at screenshots at 1280px and 390px.
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
Change the knowledge or the page → run the tests → the user approves → `npm run deploy`. A hard refresh (Ctrl+Shift+R) shows the new version at once.

## Lessons from building the first one
- Test browsers report "HeadlessChrome", which the stats skip as a bot: give test contexts a normal user agent when checking stats.
- On Windows PowerShell 5.1, `git commit -m` breaks on quotes: write the message to a file and use `git commit -F`.
- An old `wrangler dev` left running keeps its port: start the test server on a fresh port instead of stopping processes you did not start.
- Keep the public page one centered column on desktop too; multi-column layouts read as clutter to recruiters.
- Paste Apps Script files one at a time and check the first lines of each tab: pasting into the wrong tab is the most common mistake.
