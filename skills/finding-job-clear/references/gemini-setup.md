# Connecting Gemini (free) — full guide

Gemini powers two things: the site's chat (section 5f) and, optionally, scoring job leads inside the Job Feed (section 5e). Both use the free tier of the Gemini API. No credit card is needed.

**Golden rule:** the API key is a password. The user creates it and types it into the right place themselves. Never ask them to paste it into the chat, never write it into a file, a commit, a URL or a message. If a key ever shows up in a chat or a repo, tell the user to delete it in AI Studio and make a new one.

## 1. Get a key (the user does this, about 2 minutes)
1. Open **https://aistudio.google.com/apikey** and sign in with a Google account.
2. Press **Create API key**. If asked, choose **Create API key in new project** (one project per use keeps quotas apart: one for the site, one for the Job Feed).
3. Copy the key (it starts with `AIza`). Keep the tab open until it is saved in step 2 or 3.

Explain it to the user in these words: "This is a free key from Google. It lets the site's chat use Gemini. Don't send it to me. You'll paste it yourself in the next step."

## 2. Put the key in the site (Cloudflare Worker secret)
From the site folder, the user runs:
```
npx wrangler secret put GEMINI_API_KEY
```
and pastes the key when the terminal asks for it (nothing is shown while pasting, that's normal). Then `npm run deploy`.
- Check it worked: open the site and ask the chat a question. A written first-person answer means Gemini works. A list of raw passages with a "demo mode" note means the key is missing or wrong.
- To replace the key later: run the same command again with the new key. The old one stops being used immediately.

## 3. Put the key in Apps Script (Job Feed, optional)
In the Apps Script editor: **Project Settings** (gear icon) → **Script Properties** → **Add script property** → Property `GEMINI_KEY`, Value = the key → **Save script properties**. The code reads it with `PropertiesService.getScriptProperties().getProperty('GEMINI_KEY')`. Never write the key into the `.gs` code.

## 4. Models and limits (free tier)
- The site uses `gemini-2.5-flash` for answers and `gemini-embedding-001` for finding the right passages. When the main model is busy or out of quota (HTTP 429 or 503) it retries once on `gemini-2.5-flash-lite`, which has its own quota.
- Free quotas are per project and reset every day (Pacific time). A personal site rarely comes close, but a bot or a test loop can. The site also limits each visitor to 20 questions per 10 minutes.
- Keep scheduled scripts modest: cap Gemini calls per day in the code (for example 40) and skip the call when the cap is reached.
- Model names change over time. If answers fail with 404 "model not found", check the current list at https://ai.google.dev/gemini-api/docs/models and update `CHAT_MODEL` / `FALLBACK_MODEL` in `src/index.js`.

## 5. Troubleshooting
| What you see | What it means | Fix |
|---|---|---|
| The chat shows passages and "demo mode" | No key on the Worker | Step 2, then deploy |
| "Couldn't get an answer right now" | Gemini refused the call | `npx wrangler tail` while asking a question shows the status: 400 = bad key, 403 = key's project blocked, 404 = model renamed, 429 = quota |
| 400 `API_KEY_INVALID` | The key was deleted or mistyped | Make a new key, step 2 again |
| 429 `RESOURCE_EXHAUSTED` | Daily quota used up | The chat switches to the free Workers AI backup model by itself (`[ai]` in wrangler.toml); the quota resets the next day |
| Answers cut off mid-sentence | Output limit too low for a model that "thinks" | Keep `maxOutputTokens` at 4096 or more |
| Answers in the wrong direction (RTL/LTR) | The page decides direction per bubble from its language | Keep the `bubble()` function in `public/js/site-1.js` |

## 6. Testing without a real key
`test/mock-server.mjs` is a fake Gemini (and a fake Apps Script). Run it and start the local site with `--var GEMINI_BASE:http://127.0.0.1:8788` (the full command is in `references/site-guide.md`, step 5). Nothing is written to disk, so there is no secrets file to delete.
