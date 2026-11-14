// The code version. The same string is in apps-script/Shared.gs (CODE_VERSION) and is checked by
// scripts/check-version.mjs, so a change on one side without the other fails the tests.
// When the site reads data whose Apps Script version differs, Nika says which side is behind (once per pair).
export const CODE_VERSION = '2026.11.15';

// The public template's latest version (a plain text file in the template repo). Empty = no upstream check:
// this site is the source the template is built from. scripts/build-skill.mjs fills it in for the template.
export const UPSTREAM_VERSION_URL = 'https://raw.githubusercontent.com/Liran-Martfel/Application-Tracker-AI/main/VERSION';

// '2026.11.14' < '2026.11.20' < '2026.12.1': compared part by part as numbers
export function newer(a, b) {
  const pa = String(a || '').split(/[.-]/).map(Number), pb = String(b || '').split(/[.-]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/** Fixed texts (no model) in Nika's *bold* style: say() escapes HTML, so a tag written here would show as text. */
export function mismatchText(site, gs) {
  if (!gs) return `⚠️ *קוד ה-Apps Script לא מעודכן*\nהאתר בגרסה ${site}, אבל Apps Script לא מדווח גרסה בכלל, כלומר הקבצים שם ישנים.\nהדרך הקלה: node scripts/gs-sync.mjs push (או להדביק מחדש את כל הקבצים). המדריך: references/updating.md`;
  return newer(site, gs)
    ? `⚠️ *קוד ה-Apps Script מאחור*\nהאתר בגרסה ${site}, ו-Apps Script בגרסה ${gs}. כנראה שלא כל הקבצים עודכנו.\nהדרך הקלה: node scripts/gs-sync.mjs push. המדריך: references/updating.md`
    : `⚠️ *האתר מאחור*\nApps Script בגרסה ${gs}, והאתר בגרסה ${site}. צריך לפרוס את האתר מחדש (npx wrangler deploy).`;
}
export function upstreamText(cur, latest) {
  return `🆕 *יש גרסה חדשה של המערכת* (${latest}, אצלך ${cur}).\nכדי לעדכן, אפשר לבקש מ-Claude: "לעדכן את מערכת החיפוש לגרסה החדשה". המדריך: references/updating.md`;
}
