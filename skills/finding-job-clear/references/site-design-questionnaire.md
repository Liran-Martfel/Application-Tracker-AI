# Site design questionnaire

Decides how the personal site looks and sounds before anything is built. Ask in the user's language with AskUserQuestion (at most 4 questions per round, recommended option first). Three short rounds. Then show, don't describe: real screenshots of the user's own page in the candidate looks (see "Showing the options").

## Round 1 — feeling and colors
1. **First impression**: what should a recruiter feel in the first second? — Professional and calm (Recommended) / Warm and friendly / Fresh and optimistic / Bold and techy
2. **Light or dark**: — Always light, for every visitor (Recommended: the same first impression for everyone, never gloomy) / Follow the visitor's device / Always dark
3. **Palette**: — one of the presets below / "I'll send my own palettes" (screenshots or hex codes; build a full token set from each, as below) / "Pick for me"
4. **Background**: — Plain, soft top-to-bottom shade (Recommended) / Soft color spots

## Round 2 — layout and voice
1. **Voice**: — First person, as if I wrote it, chat included (Recommended) / Third person
2. **Languages**: — Hebrew and English with a switch (Recommended for Israel) / Only Hebrew / Only English / Other
3. **Order on the page**: — Projects, then chat, then experience and skills (Recommended: proof before the request; most visitors only see the first screen) / Chat first
4. **Photo**: — One photo / A few that change slowly / Initials only

## Round 3 — details
1. **Contact buttons** (several): Email, WhatsApp, GitHub, LinkedIn, CV download (Hebrew / English)
2. **Project cards show**: — A key result + two short paragraphs + links + "Ask about it" (Recommended) / A short line and links only
3. **Private-area entry**: — A small quiet lock at the bottom (Recommended) / No visible entry (the user types /app)
4. **Analytics note in the footer**: — One short line that anonymous stats are kept (Recommended: honest, and expected for privacy) / None

## Fixed rules (not asked, learned the hard way)
- **One centered column on every screen.** On computers it is just wider (about 900px); never split the page into side-by-side columns. Users called that "Tetris".
- **Small controls**: buttons about 38–42px high, chips about 30px, a compact language switch that never moves when the language changes.
- **Arrows on the sides** of the project card, a row of all project names above it (visible all at once, wrapping), wrap-around from the last project to the first, per-card height.
- **No colons, semicolons or em dashes** in visible text; plain sentences in each language.
- **Never volunteer weaknesses**: the chat names a missing skill only when asked about that exact skill.
- **Don't advertise the plumbing**: describe what the site does for the visitor, not how answers are sourced or that visits are counted (the footer line covers privacy).
- **Bidi**: every chat bubble takes its direction from its own language, and Latin runs inside Hebrew are isolated.

## Presets (exact tokens for the `:root` THEME block of `public/index.html` and `public/app.html`)
The names are roles: `--navy` = main text, `--accent` = buttons and links, `--gold` = highlight. All presets below are light; for a dark look also change the sticky bar background (`.top`) and the card shadows.

| Preset | --bg | --bg-2 | --navy (text) | --navy-deep | --accent | --gold (highlight) | --gold-ink | --text-muted |
|---|---|---|---|---|---|---|---|---|
| Slate and copper (default) | #eceae8 | #f6f5f4 | #2b3445 | #1f2633 | #2b3445 | #a5694b | #8a5238 | #5d6470 |
| Emerald | #e4f4ec | #f2faf6 | #0b2f28 | #062a26 | #057a4c | #2ea585 | #1d6b53 | #3f5f56 |
| Sand and dusty blue | #ebe7e0 | #f5f2ed | #2c3a44 | #1f2b33 | #4f7d94 | #6894aa | #456c80 | #625f5c |
| Tea field | #eaf3e7 | #f6faf4 | #0c2b16 | #072110 | #1f6fa4 | #64b334 | #2f6f1a | #4a5a4c |
| Pale royal | #e6ecfb | #f2f5fd | #172554 | #0f1a3d | #2b50c8 | #c08a2a | #8a5f12 | #4b5675 |
| Ice blue | #e9eff8 | #f5f8fc | #1b2a4a | #111c33 | #24407a | #b88a3e | #7d5a17 | #566178 |

Derived tokens: `--accent-soft` = accent at 8–11% opacity, `--gold-soft` = gold at 13–16%, `--hair` = text color at 22%, `--primary-grad` = a slightly lighter accent → `--navy-deep`, `--glass-bg` = white at 55–60%, `--glass-strong` = white at 84–86%.

## Showing the options
1. Build the page once with real content (or a structure-only demo if content isn't ready).
2. Run it locally and take Playwright screenshots of the real page in each candidate palette, at 1280px and 390px, plus the project card: inject the tokens with `page.addStyleTag`.
3. Publish one comparison page (an Artifact with the screenshots embedded) with one recommendation and why. Let the user iterate: they may send their own palettes, ask for "the same color but lighter", or to remove the background spots. Re-shoot each round.
4. Apply the chosen tokens to the page and the private area, and run the tests.
5. Before any bigger change (a new section, a new layout), show a demo first and change the real page only after the user approves.
