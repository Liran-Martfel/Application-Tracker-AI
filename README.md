# Application Tracker AI

<div dir="rtl">

סקיל ל-Claude שבונה לך דשבורד פרטי לכל קורות החיים ששלחת. הוא מתעדכן לבד מה-Gmail ומאתרי הדרושים, מכין טיוטות פולואפ, ממליץ על משרות ושולח התראה כשמזמינים אותך לראיון. יש בו גם שדרוג קורות חיים למשרה מסוימת, והגשת קורות חיים במייל או בטופס. שניהם קורים רק כשמבקשים, וכל שליחה מחכה לאישור שלך.

## מה יש כאן

| סקיל | מה הוא עושה |
|---|---|
| [`finding-job-clear`](skills/finding-job-clear) | מעקב חיפוש עבודה מלא: דשבורד, סנכרון Gmail, פולואפים, משרות מומלצות, התראות ושדרוג קורות חיים |
| [`human-writing`](skills/human-writing) | שפה אנושית: כללים לכתיבת קורות חיים, מיילים והודעות שנשמעים כמו אדם אמיתי, בלי להמציא כלום |

## התקנה ב-claude.ai (שלושה צעדים)

1. מורידים את הקובץ: [`finding-job-clear.zip`](dist/finding-job-clear.zip) (ובנוסף, אם רוצים, [`human-writing.zip`](dist/human-writing.zip)). בעמוד הקובץ לוחצים על כפתור ההורדה.
2. ב-Claude נכנסים ל-<bdi>Customize → Skills → + → Create skill → Upload a skill</bdi> ומעלים את ה-ZIP כמו שהוא, בלי לפתוח אותו.
3. כותבים ל-Claude: **תקים לי מעקב חיפוש עבודה**, ומצרפים קורות חיים.

### מה צריך לפני

- יצירת קבצים פעילה: <bdi>Settings → Capabilities → Code execution and file creation</bdi> (בחשבון ארגוני, אצל המנהל)
- Gmail מחובר בקונקטורים של Claude
- לא חובה: Google Calendar, ו-Claude in Chrome לבדיקת אתרי דרושים

## התקנה ב-Claude Code

</div>

```
/plugin marketplace add Liran-Martfel/Application-Tracker-AI
/plugin install application-tracker-ai@application-tracker-ai
```

<div dir="rtl">

## פרטיות ובטיחות

- Claude אף פעם לא שולח מיילים בשמך. הוא רק מכין טיוטות ששולחים בעצמך.
- באתרי הדרושים הוא רק קורא. הוא לא לוחץ על "הגש", לא ממלא טפסים ולא מקליד סיסמאות.
- הפרטים שלך נשמרים בדשבורד הפרטי שלך ב-Claude. הסקיל עצמו לא מכיל שום מידע אישי.
- קורות החיים משתנים רק כשאתה מבקש, ואף עובדה לא מומצאת.
- הגשת קורות חיים קורית רק אחרי שאתה מאשר כל משרה בנפרד. אין שליחה אוטומטית ואין שליחה המונית.

## רישיון

MIT. מותר להשתמש, לשנות ולשתף.

</div>

---

**English:** Two Claude skills. `finding-job-clear` sets up a private, Gmail-synced job-application tracker (dashboard, follow-up drafts, job leads, push alerts, on-request CV tailoring, and CV applications sent only after you approve each one). `human-writing` contains rules for CVs and messages that read natural and invent nothing. To install on claude.ai, download the ZIP from `dist/`, go to *Customize → Skills → + → Upload a skill*, then tell Claude "set up my job tracker" and attach your CV.
