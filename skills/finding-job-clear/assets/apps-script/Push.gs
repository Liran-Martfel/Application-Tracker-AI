/**
 * Push.gs — tells the site the moment the hourly run is done, and keeps Nika's reminders in Google Tasks
 * (the tenth file in the "Job Feed" project). Never calls Gemini.
 * Uses FEED_SITE (Visitors.gs), BLOCKED/TASK_LIST/taskListId_/ALERT_HOUR (Code.gs), API_TZ/clean_ (Api.gs).
 *
 * 1) pushSite_(): the last step of runFeed. One POST to FEED_SITE + /api/push with the push key in a header, never in
 *    the URL. The key is derived from API_TOKEN (pushKey_: hex HMAC-SHA256, key = API_TOKEN, message "push"; the Worker
 *    does the same with APPS_SCRIPT_TOKEN), so no extra Script Property is needed and the key can't call the data API.
 *    A PUSH_TOKEN Script Property (with the same Worker secret) replaces it. The Worker answers at once and only then reads the
 *    fresh data itself, so the call is short. UrlFetchApp has no timeout option, so that is what keeps it short;
 *    any failure is only logged and never stops runFeed.
 * 2) interviewDates_(): the interview dates the feed found in the mails (the alert_ properties), sent with the data.
 * 3) nikaTaskAdd_() / nikaTaskState_(): a reminder {{FIRST_NAME_EN}} approved in Nika becomes a task in TASK_LIST (the only list
 *    this project writes to), and Nika asks whether it was ticked ✓ before she sends the reminder.
 *
 * Who announces what on Telegram (one owner for each kind of event, so nothing arrives twice):
 *  - Nika (the Worker, after this push, fixed texts, no model): a positive answer (interview invite, assignment,
 *    offer), a rejection, a new interview date, a new strong lead ("מתאים מאוד" with a score of LEADS_STRONG or more).
 *  - Apps Script (tgSend_ / notify_): site activity (CV downloads, contact clicks), the watchdog, and the scheduled
 *    morning, evening and weekly messages. alertImportant_ keeps the calendar popups and the task, never Telegram.
 *    While the push works, the morning message leaves out the strong-lead list (Nika already sent each one).
 */
const PUSH_PATH = '/api/push';
const PUSH_OK_HOURS = 26;   // the push counts as working if it got through within this many hours

/** hex HMAC-SHA256 of `message` with `key` (the same as the Worker's hmac() in src/index.js). */
function hmacHex_(key, message) {
  return Utilities.computeHmacSha256Signature(String(message), String(key)).map((b) => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
/** The key for POST /api/push: PUSH_TOKEN when set, else derived from API_TOKEN. '' when neither is set. */
function pushKey_(props) {
  const own = String(props.getProperty('PUSH_TOKEN') || '').trim();
  if (own) return own;
  const api = String(props.getProperty('API_TOKEN') || '').trim();
  return api ? hmacHex_(api, 'push') : '';
}

/** Tells the site that new data is ready. true when the site took it. Never throws. */
function pushSite_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = pushKey_(props);
    if (!token) { console.warn('push: no API_TOKEN'); return false; }
    const r = UrlFetchApp.fetch(FEED_SITE + PUSH_PATH, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify({ at: Date.now() }),
      headers: { 'X-Push-Token': token }, muteHttpExceptions: true, followRedirects: false,
    });
    const code = r.getResponseCode();
    if (code !== 200 && code !== 202) { console.warn('push: the site answered ' + code); return false; }
    props.setProperty('push_ok', String(Date.now()));
    return true;
  } catch (e) { console.warn('push: failed', e); return false; }
}

/** true while the push got through lately, so Nika is the one who announces new strong leads. */
function pushActive_() {
  const t = Number(PropertiesService.getScriptProperties().getProperty('push_ok')) || 0;
  return Date.now() - t < PUSH_OK_HOURS * 36e5;
}

/** Interview dates that came in a mail (not estimates), from yesterday on: [{key, company, role, at, timed}]. */
function interviewDates_() {
  try {
    const all = PropertiesService.getScriptProperties().getProperties(), from = Date.now() - 864e5, out = [];
    Object.keys(all).filter((k) => /^alert_/.test(k) && /\|ראיון\|/.test(k)).forEach((k) => {
      let o = null; try { o = JSON.parse(all[k]); } catch (e) { return; }
      if (!o || !o.at || o.at < from || /יעד משוער/.test(o.notes || '') || BLOCKED.test(String(o.what || ''))) return;
      const m = String(o.what || '').match(/^ראיון – (.+?)(?: \((.+)\))?$/);
      if (!m) return;
      // a date with no time in the mail was saved at ALERT_HOUR:00, so that hour is not shown as if it were known
      const hm = Utilities.formatDate(new Date(o.at), API_TZ, 'HH:mm');
      out.push({ key: k.slice(6), company: m[1], role: m[2] || '', at: o.at, timed: hm !== ('0' + ALERT_HOUR).slice(-2) + ':00' });
    });
    return out.sort((a, b) => a.at - b.at).slice(0, 30);
  } catch (e) { console.warn('interview dates', e); return []; }
}

// Nika's reminder → a task in the job-search list. b: {id, title, due: 'yyyy-MM-dd', time: 'HH:mm'}
function nikaTaskAdd_(b) {
  if (typeof Tasks === 'undefined') return { ok: false, error: 'tasks not enabled' };
  const title = clean_(b.title).replace(/\s+/g, ' ').trim().slice(0, 200);
  const due = String(b.due || ''), time = /^\d{2}:\d{2}$/.test(String(b.time || '')) ? String(b.time) : '';
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { ok: false, error: 'bad task' };
  if (BLOCKED.test(title)) return { ok: false, error: 'blocked' };
  const list = taskListId_();
  if (!list) return { ok: false, error: 'no list' };
  const id = String(b.id || '').replace(/[^\w-]/g, '').slice(0, 40);
  const notes = 'תזכורת מניקה בטלגרם' + (time ? ' ב-' + time : '') + '. סימון ✓ לפני כן מבטל את ההודעה.\n[nika:' + id + ']';
  const t = Tasks.Tasks.insert({ title, notes, due: due + 'T00:00:00.000Z' }, list);
  return { ok: true, task_id: t.id };
}

// which of Nika's tasks were ticked ✓ (or deleted). b: {ids: [task ids]}. A task that can't be read counts as open.
function nikaTaskState_(b) {
  const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).filter(Boolean).slice(0, 20);
  if (!ids.length || typeof Tasks === 'undefined') return { ok: true, done: [] };
  const list = taskListId_();
  if (!list) return { ok: false, error: 'no list' };
  const done = [];
  ids.forEach((id) => {
    try { const t = Tasks.Tasks.get(list, id); if (t && (t.status === 'completed' || t.deleted === true)) done.push(id); }
    catch (e) { console.warn('task state', e); }
  });
  return { ok: true, done };
}
