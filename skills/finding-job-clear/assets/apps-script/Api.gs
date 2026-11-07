/**
 * Api.gs — the website's data API (second file in the "Job Feed" project, next to Code.gs).
 * Uses SHEET_ID, LABEL and STRIP_PHONES from Code.gs.
 * Deployed as a Web app (Execute as: me, Who has access: Anyone). Every call needs the secret token.
 * Never sends email: create_draft only makes a Gmail draft.
 */
const API_TZ = 'Asia/Jerusalem';
const API_TABS = {
  applications: { name: 'הגשות', cols: ['id', 'company', 'role', 'job_id', 'channel', 'applied', 'status', 'last_update', 'next_step', 'note', 'link', 'thread_id', 'level', 'origin', 'cv_version', 'followup_after', 'followup_draft', 'followup_sent', 'direct_contact', 'direct_contact_note', 'relevant'] },
  events: { name: 'אירועים', cols: ['id', 'date', 'company', 'role', 'kind', 'text', 'link', 'action', 'mail_state', 'thread_id', 'msg_id'] },
  prep: { name: 'הכנה', cols: ['id', 'app_id', 'company', 'role', 'created', 'stage', 'about', 'questions', 'todo', 'link', 'thread_id'] },
  job_leads: { name: 'משרות מומלצות', cols: ['id', 'company', 'role', 'seen', 'fit', 'why', 'origin', 'location', 'status', 'about', 'role_desc', 'link', 'mail_link', 'source'] },
  mails: { name: 'מיילים' },
  jobs: { name: 'משרות' }
};
const API_STATUSES = ['הוגש', 'בתהליך', 'ראיון', 'הצעה', 'נדחה'];
const API_KINDS = ['הגשה', 'פנייה', 'תגובה', 'התקדמות', 'ראיון', 'הצעה', 'דחייה'];

/** Run once: creates the secret token in Script Properties (it is never written to the log). */
function setupApi() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('API_TOKEN', token);
  ensureTabs_();
  console.log('API_TOKEN saved in Project Settings → Script Properties (not shown here).');
  return true;
}

// ---------- helpers ----------
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function authed_(token) {
  const real = PropertiesService.getScriptProperties().getProperty('API_TOKEN');
  if (!real || !token || String(token).length !== real.length) return false;
  let diff = 0;
  for (let i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ String(token).charCodeAt(i);
  return diff === 0;
}
function today_() { return Utilities.formatDate(new Date(), API_TZ, 'yyyy-MM-dd'); }
function cell_(v, key) {
  if (v instanceof Date) {
    const hm = Utilities.formatDate(v, API_TZ, 'HH:mm');
    return Utilities.formatDate(v, API_TZ, hm === '00:00' ? 'yyyy-MM-dd' : 'yyyy-MM-dd HH:mm');
  }
  if (v === true || v === false) return v;
  return v == null ? '' : String(v);
}
function clean_(v) { return STRIP_PHONES(String(v == null ? '' : v)).slice(0, 2000); }
function sheetOf_(tab) { return SpreadsheetApp.openById(SHEET_ID).getSheetByName(tab); }
function ensureTabs_() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  Object.keys(API_TABS).forEach((k) => {
    const t = API_TABS[k];
    if (!t.cols) return;
    let sh = ss.getSheetByName(t.name);
    if (!sh) { sh = ss.insertSheet(t.name); sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols]); sh.setFrozenRows(1); sh.setRightToLeft(true); }
  });
  if (!ss.getSheetByName('קורות חיים')) { const sh = ss.insertSheet('קורות חיים'); sh.getRange(1, 1, 1, 2).setValues([['key', 'value']]); sh.setRightToLeft(true); }
}
function readTab_(tab) {
  const sh = sheetOf_(tab);
  if (!sh || sh.getLastRow() < 2) return [];
  const [head, ...rows] = sh.getDataRange().getValues();
  return rows.filter((r) => r.some((c) => c !== '' && c != null))
    .map((r) => { const o = {}; head.forEach((k, i) => { if (k) o[k] = cell_(r[i], k); }); return o; });
}
function header_(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String); }
function findRow_(sh, id) {
  const n = sh.getLastRow();
  if (n < 2) return -1;
  const ids = sh.getRange(2, 1, n - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}
function appendRow_(tab, obj) {
  const sh = sheetOf_(tab);
  const head = header_(sh);
  sh.appendRow(head.map((k) => (obj[k] == null ? '' : obj[k])));
}
function updateRow_(tab, id, patch) {
  const sh = sheetOf_(tab);
  const row = findRow_(sh, id);
  if (row < 0) return false;
  const head = header_(sh);
  const cur = sh.getRange(row, 1, 1, head.length).getValues()[0];
  head.forEach((k, i) => { if (Object.prototype.hasOwnProperty.call(patch, k)) cur[i] = patch[k]; });
  sh.getRange(row, 1, 1, head.length).setValues([cur]);
  return true;
}
function slug_(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';
}
function plusDays_(d, n) { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return Utilities.formatDate(x, API_TZ, 'yyyy-MM-dd'); }

// ---------- live Gmail state (ids, dates and recipients only — no bodies) ----------
function live_() {
  const out = { unread: [], sent: [] };
  try {
    GmailApp.search(`label:"${LABEL}" is:unread newer_than:60d`, 0, 100).forEach((th) => out.unread.push(th.getId()));
    GmailApp.search('in:sent newer_than:60d', 0, 100).forEach((th) => {
      const m = th.getMessages().filter((x) => x.getFrom().toLowerCase().indexOf(Session.getActiveUser().getEmail().toLowerCase()) >= 0).pop();
      if (!m) return;
      out.sent.push({
        thread_id: th.getId(),
        date: Utilities.formatDate(m.getDate(), API_TZ, "yyyy-MM-dd'T'HH:mm:ss"),
        to: String(m.getTo() || '').split(',').map((x) => ((x.match(/<([^>]+)>/) || [])[1] || x).trim().toLowerCase()).filter(Boolean)
      });
    });
  } catch (e) { out.error = String(e && e.message || e); }
  return out;
}

// ---------- GET: closed. The token must never travel in a URL (URLs end up in logs); reads come by POST ----------
function doGet(e) {
  return json_({ ok: false, error: 'use POST' });
}

// ---------- everything the site needs (POST, action "data") ----------
function data_() {
  const cvRows = readTab_('קורות חיים');
  const cv = {}; cvRows.forEach((r) => { cv[r.key] = r.value; });
  const st = readTab_('סטטוס')[0] || {};
  return json_({
    ok: true,
    applications: readTab_(API_TABS.applications.name),
    events: readTab_(API_TABS.events.name),
    prep: readTab_(API_TABS.prep.name),
    job_leads: readTab_(API_TABS.job_leads.name),
    mails: readTab_(API_TABS.mails.name),
    jobs: readTab_(API_TABS.jobs.name),
    status: st,
    cv: { text_en: cv.text_en || '', text_he: cv.text_he || '' },
    live: live_(),
    at: new Date().toISOString()
  });
}

// ---------- POST: changes the user approved on the site ----------
function doPost(e) {
  let body;
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  if (!authed_(body.token)) return json_({ ok: false, error: 'unauthorized' });
  if (body.action === 'data') return data_();   // a read: no lock needed
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return json_({ ok: false, error: 'busy' }); }
  try {
    const r = act_(body);
    return json_(r);
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function act_(b) {
  const A = API_TABS.applications.name, E = API_TABS.events.name, L = API_TABS.job_leads.name;
  const t = today_();
  switch (b.action) {
    case 'update_application': {
      if (!b.id) return { ok: false, error: 'missing id' };
      const sh = sheetOf_(A); const row = findRow_(sh, b.id);
      if (row < 0) return { ok: false, error: 'not found' };
      const head = header_(sh); const cur = sh.getRange(row, 1, 1, head.length).getValues()[0];
      const get = (k) => cur[head.indexOf(k)];
      const patch = { last_update: t };
      if (b.status != null) { if (API_STATUSES.indexOf(b.status) < 0) return { ok: false, error: 'bad status' }; patch.status = b.status; }
      if (b.next_step != null) patch.next_step = clean_(b.next_step);
      if (b.note) patch.note = [String(get('note') || ''), clean_(b.note)].filter(Boolean).join(' · ');
      ['followup_after', 'followup_draft', 'followup_sent'].forEach((k) => { if (b[k] != null) patch[k] = clean_(b[k]); });
      if (patch.status === 'נדחה') { patch.next_step = patch.next_step || ''; patch.followup_after = ''; }
      if ((patch.status === 'הוגש' || patch.status === 'בתהליך') && b.followup_after == null) patch.followup_after = plusDays_(t, 10);
      updateRow_(A, b.id, patch);
      if (b.status && b.status !== get('status')) {
        const kind = b.status === 'נדחה' ? 'דחייה' : b.status === 'ראיון' ? 'ראיון' : b.status === 'הצעה' ? 'הצעה' : 'התקדמות';
        appendRow_(E, { id: 'site-' + Date.now().toString(36), date: t, company: get('company'), role: get('role'), kind, text: clean_('עדכון מהאתר: ' + (b.note || b.next_step || b.status)), link: '', action: false, mail_state: 'נקרא', thread_id: '', msg_id: '' });
      }
      return { ok: true, id: b.id };
    }
    case 'add_application': {
      if (!b.company || !b.role) return { ok: false, error: 'missing company/role' };
      const exists = readTab_(A).some((r) => (b.job_id && r.job_id && String(r.job_id) === String(b.job_id)) || (slug_(r.company) === slug_(b.company) && slug_(r.role) === slug_(b.role)));
      if (exists) return { ok: false, error: 'exists' };
      const applied = /^\d{4}-\d{2}-\d{2}$/.test(b.applied || '') ? b.applied : t;
      const id = slug_(b.company + '-' + b.role) + '-' + Date.now().toString(36).slice(-4);
      appendRow_(A, { id, company: clean_(b.company), role: clean_(b.role), job_id: clean_(b.job_id || ''), channel: clean_(b.channel || ''), applied,
        status: API_STATUSES.indexOf(b.status) >= 0 ? b.status : 'הוגש', last_update: t, next_step: 'ממתין לתגובה', note: clean_(b.note || 'נוסף מהאתר'),
        link: clean_(b.link || ''), followup_after: plusDays_(applied, 10), relevant: '' });
      appendRow_(E, { id: 'site-' + Date.now().toString(36), date: applied, company: clean_(b.company), role: clean_(b.role), kind: 'הגשה', text: 'הגשה (נוספה מהאתר)', link: clean_(b.link || ''), action: false, mail_state: 'נשלח ממך', thread_id: '', msg_id: '' });
      return { ok: true, id };
    }
    case 'add_event': {
      if (!b.company || !b.text) return { ok: false, error: 'missing company/text' };
      const id = 'site-' + Date.now().toString(36);
      appendRow_(E, { id, date: /^\d{4}-\d{2}-\d{2}$/.test(b.date || '') ? b.date : t, company: clean_(b.company), role: clean_(b.role || ''),
        kind: API_KINDS.indexOf(b.kind) >= 0 ? b.kind : 'התקדמות', text: clean_(b.text), link: clean_(b.link || ''), action: false,
        mail_state: clean_(b.mail_state || 'נקרא'), thread_id: clean_(b.thread_id || ''), msg_id: '' });
      return { ok: true, id };
    }
    case 'remove_lead': {
      if (!b.id) return { ok: false, error: 'missing id' };
      const sh = sheetOf_(L); const row = findRow_(sh, b.id);
      if (row < 0) return { ok: false, error: 'not found' };
      sh.deleteRow(row);
      return { ok: true, id: b.id };
    }
    case 'create_draft': {
      const to = String(b.to || '').trim();
      if (to && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: 'bad address' };
      if (!b.subject && !b.body) return { ok: false, error: 'empty draft' };
      const d = GmailApp.createDraft(to, String(b.subject || '').slice(0, 300), String(b.body || '').slice(0, 10000));
      return { ok: true, draft_id: d.getId(), url: 'https://mail.google.com/mail/#drafts' };
    }
    default:
      return { ok: false, error: 'unknown action' };
  }
}
