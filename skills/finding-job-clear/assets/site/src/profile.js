// The owner's profile: the "פרופיל" tab of the Sheet (key | value | public | note), sent by the Apps Script with the
// data (Api.gs → data → profile: [{ key, value, public }]). Nika (private) reads every row. The public chat may only
// ever see rows marked public = TRUE: publicRows() is the one gate, and everything public goes through it.
// Without the tab (or without the Apps Script) the built-in texts stay as they are.
const BLOCKED = /{{BLOCKED_COMPANIES_REGEX}}/i;   // the same companies as in nika.js; ^$ for none
const isPublic = (v) => v === true || /^true$/i.test(String(v ?? '').trim());

/** The rows as they came, cleaned: [{ key, value, public }], empty and blocked rows left out. */
export function profileRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ key: String(r.key ?? '').trim().slice(0, 80), value: String(r.value ?? '').trim().slice(0, 4000), public: isPublic(r.public) }))
    .filter((r) => r.key && r.value && !BLOCKED.test(r.key + ' ' + r.value));
}

/** Only the rows marked public = TRUE, as { key, value, public: true } (so passing them through again keeps them). */
export function publicRows(rows) {
  return profileRows(rows).filter((r) => r.public === true).map((r) => ({ key: r.key, value: r.value.slice(0, 600), public: true }));
}

/** key → value, for the private side. */
export const profileMap = (rows) => Object.fromEntries(profileRows(rows).map((r) => [r.key, r.value]));

/** The public rows as one extra passage for the public chat, or null when there are none. */
export function publicPassage(rows) {
  const pub = publicRows(rows);
  if (!pub.length) return null;
  return { source: 'profile', title: 'Current profile (the newest facts, they win when another passage says otherwise)', text: pub.map((r) => `- ${r.key}: ${r.value}`).join('\n') };
}

// Nika: the rows the system prompt already uses, and the advanced rows that only the hourly script needs
const NIKA_OWN = new Set(['פנייה', 'סיפורים לראיון']);
const SKIP = /\(regex\)$/;

/** Nika's system prompt with the profile's address forms and interview stories, when the tab has them. */
export function nikaSystem(base, rows) {
  const p = profileMap(rows);
  let t = base;
  if (p['פנייה']) t = t.replace(/^מגדר: [^\n]*\n/m, () => `מגדר: ${p['פנייה']} על עצמך את מדברת בלשון נקבה.\n`);
  if (p['סיפורים לראיון']) t = t.replace(/הסיפורים האמיתיים[^:\n]*: [^\n]*\n/, () => `הסיפורים האמיתיים (מטאב הפרופיל, רק אותם ובלי להמציא):\n${p['סיפורים לראיון']}\n`);
  return t;
}

/** The short address line sent with every message to Nika, or '' to keep the built-in one. */
export const addressLine = (rows) => { const v = profileMap(rows)['פנייה']; return v ? `(${v})` : ''; };

/** Every other profile row, as a block for Nika's message (private: all rows, public or not). */
export function profileBlock(rows) {
  const list = profileRows(rows).filter((r) => !NIKA_OWN.has(r.key) && !SKIP.test(r.key));
  return list.length ? 'הפרופיל (מטאב הפרופיל בגיליון, העובדות העדכניות):\n' + list.map((r) => `- ${r.key}: ${r.value.slice(0, 800)}`).join('\n') : '';
}
