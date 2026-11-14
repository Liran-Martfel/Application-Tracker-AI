/**
 * Shared.gs — helpers for the automations that run without Claude (third file in the "Job Feed" project).
 * Gemini key: Project Settings → Script Properties → GEMINI_KEY (a key used only by this script, free tier).
 * Without the key every AI step is skipped quietly; nothing else breaks.
 */
// the code version: the same string as website/src/version.js (scripts/check-version.mjs checks). The site compares it
// with its own and Nika says when one side is behind (a file not pasted, or the site not deployed).
const CODE_VERSION = '2026.11.15';
const AI_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash'];   // first the light one; the second only if the first is unavailable
const AI_DAILY_MAX = 40;                                            // stays far below the free daily quota

// a short profile for prompts; the "קורות חיים" tab (key/value) wins when it has a "summary" row
// a short profile for prompts; the "קורות חיים" tab (key/value) wins when it has a "summary" row
// CHANGE: 4-6 lines in English, only facts from the CV (name and city, studies, experience, projects, tools, target roles, areas)
const OWNER_PROFILE_DEFAULT = [
  '{{NAME_EN}}, {{CITY}}. {{STUDIES_LINE}}',
  '{{EXPERIENCE_LINE}}',
  'Projects: {{PROJECTS_LINE}}',
  'Tools: {{TOOLS_LINE}}',
  'Target roles, in order: {{TARGET_ROLES}}.',
  'Areas: {{AREAS}}. {{WORK_PREFERENCES}}',
].join('\n');

// the "פרופיל" tab's "תקציר" wins, then the CV tab's summary, then the default; the roles and areas always come from the profile
function ownerProfile_() {
  const p = profile_();
  let base = p.fromTab['תקציר'] ? p.values['תקציר'] : '';
  if (!base) {
    try {
      const rows = readTab_('קורות חיים');
      const s = rows.find((r) => String(r.key).trim() === 'summary');
      if (s && String(s.value).trim().length > 200) base = String(s.value);
    } catch (e) {}
  }
  return String(base || p.values['תקציר']).slice(0, 4000) + '\n' + profileTargetsLines_();
}

/** Ask Gemini. Returns the text (or the parsed object with {json:true}), or null when there is no key, no budget or an error. */
function askGemini_(prompt, opts) {
  opts = opts || {};
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_KEY');
  if (!key) return null;
  const day = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd');
  const used = props.getProperty('ai_used_' + day);
  if (Number(used || 0) >= AI_DAILY_MAX) { console.warn('Gemini: daily budget used'); return null; }
  const body = {
    contents: [{ role: 'user', parts: [{ text: String(prompt).slice(0, 30000) }] }],
    generationConfig: Object.assign({ temperature: 0.3, maxOutputTokens: opts.maxTokens || 1200 }, opts.json ? { responseMimeType: 'application/json' } : {}),
  };
  for (const model of AI_MODELS) {
    let r;
    try {
      r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'post', contentType: 'application/json', payload: JSON.stringify(body), muteHttpExceptions: true, headers: { 'x-goog-api-key': key },
      });
    } catch (e) { console.warn('Gemini fetch failed', e); return null; }
    const code = r.getResponseCode();
    if (code === 404 || code === 400 && /model/i.test(r.getContentText())) continue;   // model not available for this key: try the next one
    props.setProperty('ai_used_' + day, String(Number(props.getProperty('ai_used_' + day) || 0) + 1));
    if (code === 503 || code === 429 || code === 500) { console.warn('Gemini ' + model + ' ' + code + ', trying the next model'); continue; }   // busy or over quota: the next model has its own
    if (code !== 200) { console.warn('Gemini ' + model + ' ' + code + ': ' + r.getContentText().slice(0, 300)); return null; }
    const j = JSON.parse(r.getContentText());
    const text = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map((p) => p.text || '').join('').trim();
    if (!text) return null;
    if (!opts.json) return text;
    try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { console.warn('Gemini: not JSON'); return null; }
  }
  return null;
}

/* ===== safety helpers ===== */

/**
 * A Drive folder this script owns, pinned by id in Script Properties (prop). Never a folder found by name alone:
 * anyone can share a folder with the same name, and the Sheet's backups or the CVs would then land in their folder.
 * The pinned folder is re-checked (still mine, not in the trash); otherwise a folder of that name that I own is
 * pinned, or a new one is made.
 */
function ownFolder_(prop, name) {
  const props = PropertiesService.getScriptProperties();
  const user = (typeof Session.getEffectiveUser === 'function' && Session.getEffectiveUser()) || Session.getActiveUser();
  const me = String((user && user.getEmail()) || '').trim().toLowerCase();
  const mine = (f) => {
    try { const o = f.getOwner(); return !!o && !f.isTrashed() && (!me || String(o.getEmail() || '').trim().toLowerCase() === me); }
    catch (e) { return false; }
  };
  const id = props.getProperty(prop);
  if (id) { try { const f = DriveApp.getFolderById(id); if (mine(f)) return f; } catch (e) {} }
  let folder = null;
  const it = DriveApp.searchFolders('title = "' + String(name).replace(/["\\]/g, '\\$&') + '" and "me" in owners and trashed = false');
  while (!folder && it.hasNext()) { const f = it.next(); if (mine(f)) folder = f; }
  if (!folder) folder = DriveApp.createFolder(name);
  props.setProperty(prop, folder.getId());
  return folder;
}

/** The address alone from a From/To header part: "Name <a@b.com>" → "a@b.com" (a display name can say anything). */
function senderEmail_(v) {
  const s = String(v == null ? '' : v);
  const m = s.match(/<([^<>\s]+@[^<>\s]+)>\s*$/) || s.match(/<([^<>\s]+@[^<>\s]+)>/);
  if (m) return m[1].trim().toLowerCase();
  const bare = s.trim().replace(/^"+|"+$/g, '');
  return /^[^@\s<>",]+@[^@\s<>",]+$/.test(bare) ? bare.toLowerCase() : '';
}
/** Every address in a To/Cc header: commas inside quotes ("Levi, Dana" <d@x.com>) don't split. */
function addresses_(v) {
  const parts = [], s = String(v == null ? '' : v);
  let cur = '', q = false;
  for (const ch of s) { if (ch === '"') q = !q; if (ch === ',' && !q) { parts.push(cur); cur = ''; } else cur += ch; }
  parts.push(cur);
  return parts.map(senderEmail_).filter(Boolean);
}

/* ===== Script Properties hygiene =====
 * Every alert keeps one alert_* property (Code.gs), and nothing used to delete them; Google allows 500 KB in all.
 * Once a day (and on the first run after this code arrives) this deletes:
 *  - alert_* of a blocked company (BLOCKED), always;
 *  - alert_* whose event time (`at`) passed more than 2 days ago. Lifecycle.gs marks an interview as over from one day
 *    after it, and runs (in runFeed) before this; the "how did it go?" question and the interview dates need less than
 *    a day. A legacy value that kept only the time the alert was made counts from that + the alert's default days.
 *    A future time, or a value that can't be read, is never deleted;
 *  - their passed_/task_ companions, and companions left without their alert;
 *  - notified_* (one-time phone alerts) older than 30 days and ai_used_<day> (the daily Gemini count) older than 7 days.
 */
const ALERT_KEEP_MS = 2 * 864e5;
function alertAt_(key, value) {
  let o = null;
  try { o = JSON.parse(value); } catch (e) { return 0; }
  if (o && typeof o === 'object' && Number(o.at) > 0) return Number(o.at);
  if (typeof o === 'number' && o > 1e12) {
    const kind = String(key).split('|')[1] || '';
    return o + ((typeof ALERT_DAYS !== 'undefined' && ALERT_DAYS[kind]) || 3) * 864e5;
  }
  return 0;
}
function cleanProps_(now) {
  now = Number(now) || Date.now();
  const props = PropertiesService.getScriptProperties();
  const last = Number(props.getProperty('props_gc_last') || 0);
  if (last && now - last < 864e5 && last <= now) return { skipped: true };
  const all = props.getProperties(), gone = {};
  Object.keys(all).forEach((k) => {
    const v = String(all[k] == null ? '' : all[k]);
    if (/^alert_/.test(k)) {
      if (BLOCKED.test(k + ' ' + v)) { gone[k] = 1; return; }
      const at = alertAt_(k, v);
      if (at && at < now - ALERT_KEEP_MS) gone[k] = 1;
    } else if (/^notified_/.test(k)) {
      const t = Number(v);
      if (t > 1e12 && t < now - 30 * 864e5) gone[k] = 1;
    } else if (/^ai_used_\d{4}-\d{2}-\d{2}$/.test(k)) {
      if (Date.parse(k.slice(8) + 'T00:00:00Z') < now - 7 * 864e5) gone[k] = 1;
    }
  });
  Object.keys(all).forEach((k) => {
    const m = k.match(/^(?:passed_|task_)(alert_.*)$/);
    if (m && (gone[m[1]] || all[m[1]] == null)) gone[k] = 1;
  });
  Object.keys(gone).forEach((k) => props.deleteProperty(k));
  props.setProperty('props_gc_last', String(now));
  return { deleted: Object.keys(gone).length, keys: Object.keys(gone) };
}

/** A phone notification without Claude: a short Google Calendar event with a popup at its start. once = a key so it never repeats. */
function notify_(title, notes, once) {
  const props = PropertiesService.getScriptProperties();
  if (once && props.getProperty('notified_' + once)) return false;
  const soon = new Date(Date.now() + 2 * 60000);
  const e = CalendarApp.getDefaultCalendar().createEvent(title, soon, new Date(soon.getTime() + 15 * 60000), { description: notes || '' });
  e.removeAllReminders(); e.addPopupReminder(0);
  // the same alert on Telegram (Telegram.gs), when it is set up; a failure there never stops the calendar alert
  try { if (typeof tgSend_ === 'function') tgSend_(title + (notes ? '\n' + String(notes).replace(/\n?(?:הדשבורד|הקישור לדשבורד):[^\n]*/g, '') : '')); } catch (err) { console.warn('Telegram alert failed', err); }
  if (once) props.setProperty('notified_' + once, String(Date.now()));
  return true;
}

/** The full CV text from the "קורות חיים" tab (text_en, else text_he), for scoring jobs against what {{FIRST_NAME_EN}} really knows. */
function cvText_() {
  try {
    const cv = {}; readTab_('קורות חיים').forEach((r) => { cv[String(r.key).trim()] = String(r.value || ''); });
    return (cv.text_en || cv.text_he || '').slice(0, 9000);
  } catch (e) { return ''; }
}

/**
 * The one picture of the job search that every part reads (morning brief, evening summary, weekly summary),
 * the same rules as the site's dashboard and Nika:
 *  - waiting: events still marked as waiting for {{FIRST_NAME_EN}}'s reply (action true). Once an interview is marked done,
 *    a reply is sent or the application is archived, the event is closed and drops out everywhere.
 *  - followDue: open applications whose follow-up date came, that have a direct email to write to and no follow-up yet.
 *  - archived: applications the hourly script archived (45 days with no news).
 */
const JS_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function jobState_(today) {
  today = today || Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd');
  const apps = readTab_(API_TABS.applications.name).filter((a) => !BLOCKED.test(a.company + ' ' + a.role));
  const isArchived = (a) => a.relevant === false || String(a.relevant).toLowerCase() === 'false';
  const open = apps.filter((a) => a.status !== 'נדחה' && !isArchived(a));
  const day30 = Utilities.formatDate(new Date(Date.now() - 30 * 864e5), 'Asia/Jerusalem', 'yyyy-MM-dd');
  const closed = new Set(apps.filter((a) => a.status === 'נדחה' || isArchived(a)).map((a) => String(a.thread_id || '')).filter(Boolean));
  const waiting = readTab_(API_TABS.events.name)
    .filter((e) => /^true$/i.test(String(e.action)) && String(e.date).slice(0, 10) >= day30 && !closed.has(String(e.thread_id || '')) && !BLOCKED.test(e.company + ' ' + e.text))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const followDue = open.filter((a) => a.followup_after && String(a.followup_after).slice(0, 10) <= today && !a.followup_sent && JS_EMAIL.test(String(a.direct_contact || '').trim()));
  return { today, apps, open, waiting, followDue, archived: apps.filter(isArchived) };
}

/* ===== the "פרופיל" tab: one source for the facts about {{FIRST_NAME_EN}} (key | value | public | note, one fact per row) =====
 * Every part reads it through profile_(), once per run. A key that is missing or empty in the tab keeps the value
 * below, so nothing changes before the tab is filled. public = TRUE only for facts the site's public chat may use;
 * every other row stays private (leads scoring, interview prep, Telegram, Nika). Run setupProfile once to create it.
 */
const PROFILE_TAB = 'פרופיל';
let profileMemo_ = null;   // read once per run

// today's values: the defaults, and what setupProfile writes into a new tab. [key, value, public, note]
function profileDefaults_() {
  // CHANGE: the owner's facts, only from the CV, the profile and the personality questionnaire, never invented.
  // These are the defaults: the "פרופיל" tab (run setupProfile once) wins for every key filled in there.
  return [
    ['תקציר', OWNER_PROFILE_DEFAULT.split('\n').filter((l) => !/^(Target roles|Areas)\b/.test(l)).join('\n'), false, 'a few English lines for the Gemini prompts: studies, experience, projects, tools (roles and areas come from the rows below)'],
    ['תפקידי יעד', '{{TARGET_ROLES}}', true, 'in order of priority, English'],
    ['גם פתוח ל', '{{OPEN_TO_ROLES_EN}}', true, 'roles scored "מתאים", after the target roles (empty for none)'],
    ['לא מתאים', '{{NOT_FIT_ROLES_EN}}', false, 'roles always scored "לא מתאים", e.g. student, intern, support or sales roles'],
    ['ניסיון מעשי', '{{HANDS_ON_EXPERIENCE_EN}}', true, 'English, it ends the sentence "They have ...", e.g. about one year of hands-on experience'],
    ['שנות ניסיון חוסמות', '{{MAX_YEARS_DEMANDED}}', false, 'a job that asks for this many years or more is never recommended (1-9, default 2)'],
    ['אזורים', '{{AREAS}}', true, 'English'],
    ['העדפות עבודה', '{{WORK_PREFERENCES}}', true, 'English'],
    ['כלל מיקום', '{{LOCATION_RULE_EN}}', false, 'the location rule for scoring jobs, English: the areas that are fine and which ones are too far'],
    ['סיפורים לראיון', OWNER_STORIES, false, 'true stories only: interview prep pages and Nika\'s interview practice'],
    ['שורה עליי', '{{ONE_LINE_ABOUT_EN}}', false, 'one English line for the follow-up drafts'],
    ['פנייה', '{{ADDRESS_FORMS_HE}}', false, 'how Nika addresses the owner in Hebrew, one sentence'],
    ['עיר למזג אוויר', TG_WEATHER_CITY, false, 'the morning brief on Telegram (wttr.in, English name)'],
    ['תפקידי יעד (regex)', '', false, 'advanced: the hourly filter on LinkedIn titles; empty = the built-in TARGET_ROLES'],
    ['מילים לדילוג בכותרת (regex)', '', false, 'advanced: titles with these words are skipped; empty = the built-in list in Code.gs'],
  ];
}

/** The tab's rows as written: [{key, value, public}], empty and blocked rows left out. Also what the site gets. */
function profileRows_() {
  try {
    return readTab_(PROFILE_TAB).map((r) => ({ key: String(r.key || '').trim(), value: String(r.value == null ? '' : r.value).trim().slice(0, 4000), public: r.public === true || /^true$/i.test(String(r.public == null ? '' : r.public).trim()) }))
      .filter((r) => r.key && r.value && !BLOCKED.test(r.key + ' ' + r.value));
  } catch (e) { console.warn('profile tab', e); return []; }
}

/** { values, fromTab }: the defaults, with every value written in the tab on top. Read once per run. */
function profile_() {
  if (profileMemo_) return profileMemo_;
  const values = {}, fromTab = {};
  profileDefaults_().forEach((r) => { values[r[0]] = String(r[1] == null ? '' : r[1]); });
  profileRows_().forEach((r) => { values[r.key] = r.value; fromTab[r.key] = true; });
  return (profileMemo_ = { values, fromTab, re: {} });
}
function profileGet_(key) { return profile_().values[key] || ''; }

/** A regex written in the tab (with or without /…/i), or null when it is empty or not a valid regex. */
function profileRe_(key) {
  const p = profile_();
  if (key in p.re) return p.re[key];
  const v = String(p.values[key] || '').trim().replace(/^\/([\s\S]*)\/[a-z]*$/, '$1');
  let re = null;
  if (v) { try { re = new RegExp(v, 'i'); } catch (e) { console.warn('profile: not a valid regex in "' + key + '"'); } }
  return (p.re[key] = re);
}

/** How many years of experience a job may not ask for (1-9, default 2), and the title regex for it. */
function profileYears_() {
  const n = Math.round(Number(profileGet_('שנות ניסיון חוסמות')));
  return n >= 1 && n <= 9 ? n : 2;
}
function profileTooExperienced_() {
  const p = profile_();
  if (p.re.__years) return p.re.__years;
  const n = profileYears_(), plus = '[' + n + '-9]|1\\d', plain = n < 9 ? '[' + (n + 1) + '-9]|1\\d' : '1\\d';
  // with 2 this is exactly TOO_EXPERIENCED in Code.gs: "2+ years", "3 years", "3-5 years", "3 שנות ניסיון"
  return (p.re.__years = new RegExp('\\b(' + plus + ')\\s*\\+\\s*(years?|yrs?|שנ)|\\b(' + plain + ')\\s*(-\\s*\\d+\\s*)?(years?|yrs?)\\b|\\b(' + plain + ')\\s*(שנות|שנים)', 'i'));
}

/** The roles and areas lines of the prompt profile. */
function profileTargetsLines_() {
  const open = profileGet_('גם פתוח ל');
  return ['Target roles, in order: ' + profileGet_('תפקידי יעד') + '.' + (open ? ' Also open to ' + open + '.' : ''),
    'Areas: ' + profileGet_('אזורים') + '. ' + profileGet_('העדפות עבודה')].join('\n');
}

/** Run once from the editor: creates the "פרופיל" tab filled with today's values. An existing tab is never touched. */
function setupProfile() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  if (ss.getSheetByName(PROFILE_TAB)) { console.log('The "' + PROFILE_TAB + '" tab already exists: nothing was changed.'); return false; }
  // a summary already kept in the CV tab moves here as it is, so the prompts stay the same
  let cvSummary = '';
  try { const s = readTab_('קורות חיים').find((r) => String(r.key).trim() === 'summary'); if (s && String(s.value).trim().length > 200) cvSummary = String(s.value).trim(); } catch (e) {}
  const rows = profileDefaults_().map((r) => [r[0], r[0] === 'תקציר' && cvSummary ? cvSummary : r[1], r[2] === true, r[3] || '']);
  const sh = ss.insertSheet(PROFILE_TAB);
  sh.getRange(1, 1, rows.length + 1, 4).setValues([['key', 'value', 'public', 'note'], ...rows]);
  sh.setFrozenRows(1); sh.setRightToLeft(true);
  try { sh.getRange(2, 3, rows.length, 1).insertCheckboxes(); } catch (e) {}
  profileMemo_ = null;
  console.log('✅ The "' + PROFILE_TAB + '" tab was created with ' + rows.length + ' rows. Change a value there and every part uses it; public = TRUE only for what the site\'s public chat may say.');
  return true;
}
