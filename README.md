# Application-Tracker-AI

**עברית** · [English](#english)

**⬇️ [להורדת הסקיל (finding-job-clear.zip)](https://github.com/Liran-Martfel/Application-Tracker-AI/raw/main/dist/finding-job-clear.zip)** · **[מפת ההתקנה בעברית](skills/finding-job-clear/references/setup-roadmap.he.md)**

מערכת לניהול חיפוש עבודה. Claude מתקין אותה ומעדכן אותה, אבל **היא רצה בלי Claude**: על Google Apps Script, Cloudflare, Gemini (חינמי) ו-Workers AI. גם כשנגמר השימוש ב-Claude, שום דבר לא נעצר.

## מה מקבלים
- **דשבורד** שמסונכרן ל-Gmail: הגשות, תשובות, ארכיון, פולואפים ומשרות מומלצות.
- **Job Feed:** סקריפט Google Apps Script שמעדכן הכול כל שעה, גם כשהמחשב כבוי וגם כשנגמר השימוש ב-Claude. הוא מוסיף התראות ביומן לפני ראיונות, משימות ב-Google Tasks וגיבוי שבועי.
- **התראות בטלגרם:** תדריך בוקר, סיכום ערב, וסיכום שבועי שמראה מה עובד (אילו סוגי תפקידים וערוצים מתקדמים).
- **אתר אישי למגייסים** (אופציונלי, חינמי): קרוסלת פרויקטים וצ׳אט AI שעונה בשמכם. האזור הפרטי כולל:
  - דשבורד שמתרענן לבד
  - קובץ קורות חיים מותאם לכל משרה, ב-PDF וב-Word
- **ניקה:** עוזרת אחת בטלגרם ובדשבורד, עם אותה שיחה בשני המקומות. אפשר לשאול אותה מה מחכה לכם, לדווח לה על שינוי, לבקש תזכורת או לתרגל איתה ראיון. היא מבינה גם הודעות קוליות, ושולחת התראה מיידית כשמגיעה הזמנה לראיון. היא לא משנה כלום בלי אישור בכפתור.

## מה צריך לפני שמתחילים
- חשבון Claude (מומלץ מנוי בתשלום) ו-**Claude Code** (אפליקציית Desktop או התוסף ל-VS Code): claude.ai/download
- **Node.js** בגרסה 20 ומעלה: nodejs.org, גרסת LTS
- חשבון Google (ה-Gmail של חיפוש העבודה) וקורות החיים שלכם
- לטלגרם ולאתר: אפליקציית טלגרם וחשבון Cloudflare חינמי

**זמן כולל:** המערכת המלאה לוקחת כ-2.5 עד 3.5 שעות. אפשר לחלק ליומיים: ביום הראשון פרופיל, עדכונים וטלגרם (כשעה), וביום השני האתר וניקה. עדכונים + טלגרם בלבד: כשעה. אם צריך להתקין קודם את Claude Code ו-Node.js, להוסיף כחצי שעה. הפירוט המלא, כולל מה עושים בכל שלב בעצמכם, נמצא ב[מפת ההתקנה](skills/finding-job-clear/references/setup-roadmap.he.md).

## איך מתחילים
1. מורידים את הסקיל: **[finding-job-clear.zip](https://github.com/Liran-Martfel/Application-Tracker-AI/raw/main/dist/finding-job-clear.zip)**.
2. פורסים אותו לתיקייה `~/.claude/skills/finding-job-clear` ופותחים מחדש את Claude Code. אם עובדים ב-claude.ai, מעלים את ה-zip כסקיל (Settings → Skills).
3. כותבים ל-Claude: "תקים לי מעקב חיפוש עבודה".

Claude שואל מה אתם רוצים ומוביל אתכם לפי [מפת ההתקנה](skills/finding-job-clear/references/setup-roadmap.he.md):

| שלב | מה מקבלים | זמן |
|---|---|---|
| 0 | פרופיל (פעם אחת, מקורות החיים) | 10 דק׳ |
| 1 | דשבורד בתוך Claude (לא חובה) | 10 דק׳ |
| 2 | Job Feed: עדכונים כל שעה בלי Claude | 30 דק׳ |
| 3 | מפתח Gemini (חינמי) | 5 דק׳ |
| 4 | התראות בטלגרם | 10 דק׳ |
| 5 | אתר אישי + דשבורד פרטי | 1–2 שעות |
| 6 | ניקה בטלגרם ובדשבורד | 10 דק׳ |
| 7 | בדיקה סופית | 10 דק׳ |

בוחרים חבילה: **המערכת המלאה** (מומלץ, בלי תלות ב-Claude), **עדכונים + טלגרם**, **עדכונים בלבד**, או **דשבורד בתוך Claude**. אפשר להוסיף חלקים בכל שלב בהמשך, למשל "תוסיף לי את האתר". בסוף כל שלב בודקים יחד שהוא עובד, ורק אז ממשיכים. אם עוצרים באמצע, בשיחה הבאה Claude יודע איפה עצרתם. עדכונים לגרסה חדשה מגיעים בהודעה מניקה, וההוראות נמצאות ב[מדריך העדכון](skills/finding-job-clear/references/updating.md).

**מה יש כאן:**
- `skills/finding-job-clear`: הסקיל הראשי, המדריכים וכל הקוד.
- `skills/human-writing`
- `skills/gmail-job-labels`
- `dist/`: קבצי ההתקנה.
- `VERSION`: הגרסה האחרונה.

---

## English

**⬇️ [Download the skill (finding-job-clear.zip)](https://github.com/Liran-Martfel/Application-Tracker-AI/raw/main/dist/finding-job-clear.zip)** · **[Setup roadmap](skills/finding-job-clear/references/setup-roadmap.md)**

A job-search system that Claude installs and updates, but that **runs without Claude**: on Google Apps Script, Cloudflare, Gemini (free) and Workers AI. When your Claude usage runs out, nothing stops.

## What you get
- A **dashboard** synced with Gmail: applications, replies, archive, follow-ups and recommended jobs.
- **Job Feed:** a Google Apps Script that updates everything hourly, even when your computer is off and when your Claude usage has run out. It adds calendar alerts before interviews, Google Tasks items and a weekly backup.
- **Telegram alerts:** a morning brief, an evening summary, and a weekly summary that shows what works (which role types and channels move forward).
- An optional free **personal recruiter site:** a project carousel and an AI chat that answers in your voice. The private area includes:
  - a dashboard that refreshes by itself;
  - a CV file tailored to each job, in PDF and Word.
- **Nika:** one assistant on Telegram and in the dashboard, with the same conversation in both places. You can ask her what is waiting for you, tell her about a change, ask for a reminder or practice an interview. She understands voice messages and alerts you instantly when an interview invite arrives. Nothing changes until you press a button.

## Before you start
Claude (a paid plan is recommended) and **Claude Code** (desktop app or VS Code extension, claude.ai/download); **Node.js 20+** (nodejs.org, LTS); the Google account you job-hunt with, and your CV; for Telegram and the site: the Telegram app and a free Cloudflare account.
**Total time:** the full system takes about 2.5–3.5 hours, easy to split over two days. Updates + Telegram only: about an hour. Add about 30 minutes if Claude Code or Node.js still need installing. The [setup roadmap](skills/finding-job-clear/references/setup-roadmap.md) lists what you do yourself in each phase.

## Getting started
1. Download the skill: **[finding-job-clear.zip](https://github.com/Liran-Martfel/Application-Tracker-AI/raw/main/dist/finding-job-clear.zip)**.
2. Unzip it into `~/.claude/skills/finding-job-clear` and restart Claude Code (in claude.ai: Settings → Skills → upload the zip).
3. Tell Claude: "Set up my job tracker".

Claude asks which package you want (the full system is recommended; parts can be added later) and guides you through the [setup roadmap](skills/finding-job-clear/references/setup-roadmap.md):
0. your profile (from your CV);
1. a dashboard inside Claude (optional);
2. the Job Feed;
3. a Gemini key;
4. Telegram alerts;
5. the personal site;
6. Nika;
7. a final check.

At the end of each phase you check together that it works, and only then move on. If you stop halfway, Claude knows where you stopped in the next session. When a new version comes out, Nika tells you; the steps are in the [update guide](skills/finding-job-clear/references/updating.md).

License: MIT
