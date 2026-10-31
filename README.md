# Application-Tracker-AI

**עברית** · [English](#english)

מערכת מעקב אחרי הגשות לעבודה שבנויה על Claude:
- **דשבורד** שמסונכרן ל-Gmail: הגשות, תשובות, ארכיון, פולואפים ומשרות מומלצות.
- **טיוטות פולואפ** ב-Gmail (לא נשלחות לבד).
- **Job Feed**: סקריפט Google Apps Script שאוסף עדכונים כל שעה, גם בלי Claude.
- **סוכן מקומי** (אופציונלי) עם Ollama בתוך הדשבורד.

**מה יש כאן:** `skills/finding-job-clear` (הסקיל הראשי), `skills/human-writing`, `skills/gmail-job-labels`, ו-`dist/` (קבצי zip להתקנה + `jobs-agent.mcpb`).

**התקנה ב-3 צעדים**
1. להוריד את `dist/finding-job-clear.zip`.
2. להעלות אותו כסקיל ב-Claude (Customize → Skills).
3. לכתוב ל-Claude: "תבנה לי מעקב משרות".

---

## English

A Claude-powered job-application tracker:
- A **dashboard** synced with Gmail: applications, replies, archive, follow-ups and recommended jobs.
- **Follow-up drafts** in Gmail (never sent automatically).
- **Job Feed**: a Google Apps Script that collects updates hourly, without Claude.
- An optional **local agent** (Ollama) inside the dashboard.

**Contents:** `skills/finding-job-clear` (main skill), `skills/human-writing`, `skills/gmail-job-labels`, and `dist/` (installable zips + `jobs-agent.mcpb`).

**Install in 3 steps**
1. Download `dist/finding-job-clear.zip`.
2. Upload it as a skill in Claude (Customize → Skills).
3. Tell Claude: "Build me a job tracker".

License: MIT
