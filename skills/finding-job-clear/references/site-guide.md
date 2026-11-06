# Personal recruiter site — build guide (section 5f)

A free personal site on Cloudflare Workers: the user's photo and contact buttons, a project carousel, an AI chat that answers recruiters in the user's own voice from a knowledge base, experience, skills, and a private page with anonymous visit stats. Template: `assets/site/`.

## What the user needs (free)
- A Cloudflare account (sign-up at dash.cloudflare.com, no card). The site lives at `<worker-name>.<account-subdomain>.workers.dev`.
- Node.js 20+ on the computer, and a terminal (Claude Code can run the commands).
- A Gemini API key: `references/gemini-setup.md`.
- Their CV, and links to their projects (GitHub repos, live demos).

## Steps
1. **Questionnaires.** Run `references/site-design-questionnaire.md` (3 rounds) and `references/personality-questionnaire.md` (7 rounds). Both can be skipped and done later.
2. **Copy the template** into a new folder of the user's choice (a private git repo if they want one: the site's code holds their email and phone, so it does not belong in a public repo). Run `npm install`.
3. **Fill the page** (`public/index.html`), every `{{…}}` placeholder:

| Placeholder | From |
|---|---|
| `NAME_EN`, `INITIALS`, `HEADLINE_EN`, `META_DESCRIPTION` | CV |
| `TAGLINE_EN/HE`, `SKILLS_LINE` (3 key skills), `LOOKING_FOR_EN/HE`, `LOCATION_EN/HE` | CV + profile (`target_roles`, `location`) |
| `EMAIL`, `GITHUB_URL`, `WHATSAPP_INTL` (digits with country code, no +) | profile, only what the user agreed to show |
| `SITE_URL` | `https://<worker>.<account>.workers.dev` (after the first deploy) |
| `CHAT_PLACEHOLDER_EN/HE`, `CHIPS_EN/HE` (4 ready questions, JSON arrays, addressing the user: "Which tools do you use?") | written for this user |
| `PROJECTS_HINT_EN/HE` | one line over the projects |
| `FILL PROJECTS`, `FILL EXPERIENCE`, `FILL SKILLS` blocks | see "Content rules"; each block shows the exact row shape |
| `FILL THEME` block | the chosen preset tokens (design questionnaire) |

   Then `public/login.html` (`PRIVATE_AREA_LINE`, one line), `public/app.html` (`TRACKER_URL` = the job-search dashboard link, or delete that button; the same THEME tokens), `public/favicon.svg` (`INITIALS`), `wrangler.toml` (`WORKER_NAME`, `NAME_EN`, `EMAIL`, `PHONE_OR_EMPTY`, `GENDER` m/f/x). Photos: `public/profile-1.jpg` (and `-2`, `-3`, square, ~280px), or delete the `<img>` tags to show initials. CVs: `public/cv/CV-HE.pdf`, `public/cv/CV-EN.pdf`. A 1200×630 `public/og.png` for link previews.
4. **Fill the knowledge** (`knowledge/*.md`) — this is what the chat knows:
   - `profile.md` from the CV and profile; `experience.md` from the CV; `personality.md` from the questionnaire.
   - `projects.md`: for each project, read its README and any journal or log in the repo (GitHub connector or `gh`), and write four sections whose headings all carry the project name: overview, how it was built, challenges and how they were solved, results and lessons. Only facts from those sources; numbers exactly as written there.
   - Each heading becomes one passage the chat can retrieve, so a heading must make sense alone ("Weather App: challenges", not "Challenges").
   - Never mention who wrote a repo's notes or journal (for example an AI assistant); write what the user did.
   - Leave out anything about visitor tracking, private areas or internal plumbing.
   - Show the user the knowledge files and get their OK.
5. **Build and test locally**: `npm run build` (splits the knowledge into passages), then the steps at the top of `test/site.test.cjs` (fake Gemini, local `.dev.vars`, `wrangler dev`). All checks must pass, including "no {{placeholders}} left". Look at screenshots at 1280px and 390px. Delete `.dev.vars` afterwards.
6. **Deploy (the user approves every deploy)**: the user runs `npx wrangler login` (browser sign-in), then sets the three secrets themselves, typing them, never in chat:
   ```
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put ADMIN_PASSWORD      # the private-area password, chosen by the user
   npx wrangler secret put SESSION_SECRET      # any long random string
   ```
   and `npm run deploy`. Check the live page, ask the chat two questions (one about tools, one "am I talking to you or a bot?"), and open `/app`.
7. **Hand over**: the address, how to sign in (the lock at the bottom, "remember me"), and how to remove their own test visits ("delete my visits from this device", once per device). A device that signed in once is never counted again.

## Content rules (they decide how good the site feels)
- **First person everywhere**, headings included ("My projects"). In Hebrew, the user's own gender forms.
- **Plain sentences**: no colons, semicolons or em dashes in visible text.
- **Projects, ordered by fit to the target roles**, strongest first (the first one or two are all most visitors see); no two similar projects in a row; projects with a live demo early. Add "this website" as a project when the target roles are AI, solutions or integration.
- **Each card**: a kind label, ONE true key result (a number when there is one), two short paragraphs (what and how; one decision or challenge and the result), links, and "Ask about it" with a ready question the knowledge can answer. No list of skills on the card.
- **Experience**: one or two first-person sentences per role, with a real result. Education with the real grade if the user wants it shown.
- **Skills**: grouped (AI and LLMs, machine learning and data, programming languages, development and deployment, work tools, courses, languages). Only tools the user really used.
- **The chat** never mentions skills the user lacks unless asked about that exact skill, mentions every role the user is open to, and says honestly that it is an AI assistant when asked.

## Optional: a nicer free address
The free address is `<worker>.<account>.workers.dev`. To get e.g. `portfolio.<account>.workers.dev` without breaking old links or losing stats: deploy a second tiny Worker named `portfolio` whose only code is `export default { fetch: (req, env) => env.SITE.fetch(req) }`, with `[[services]] binding = "SITE", service = "<main worker name>"` in its wrangler.toml. Both addresses then serve the same site. Update `SITE_URL` (link previews and canonical) to the new one. A paid domain can be connected the same way later.

## Updating later
Change the knowledge or the page → run the tests → the user approves → `npm run deploy`. After a deploy, the live page can take a few seconds to show the new version; a hard refresh (Ctrl+Shift+R) helps.

## Lessons from building the first one
- Test browsers report "HeadlessChrome", which the stats skip as a bot: give test contexts a normal user agent when checking stats.
- On Windows PowerShell 5.1, `git commit -m` breaks on quotes in the message: write it to a file and use `git commit -F`. PowerShell's `WriteAllLines` switches files to CRLF, which breaks multi-line text replacements: normalise to LF first.
- An old `wrangler dev` left running keeps its port; start the test server on a fresh port instead of stopping processes you did not start.
- Sticky elements inside a CSS grid stick across the whole grid, not their area: wrap them, or (better) keep the one-column layout.
