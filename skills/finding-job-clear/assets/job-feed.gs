/**
 * Job Feed – runs on Google's servers every hour, for free, without Claude.
 * Reads job-search mail in Gmail, labels it "חיפוש עבודה", classifies it with simple rules
 * and writes it to the "Job Feed" Google Sheet, which the dashboard shows live.
 * It also collects new jobs from LinkedIn job-alert emails.
 * It never sends, deletes or archives anything.
 *
 * Setup (once): Extensions are not needed. Paste this file, run `setup`, approve the permissions.
 */
const SHEET_ID = '{{SHEET_ID}}';
const LABEL = 'חיפוש עבודה';
const LOOKBACK = '3d';
const SENDERS = [{{SENDERS}}, 'jobs-noreply@linkedin.com'];
const SUBJECT_WORDS = ['"your application"', '"thank you for applying"', '"application received"', 'מועמדות', 'מועמדותך', '"קורות החיים"', 'interview', 'ראיון'];

const RULES = [
  ['דחייה', /unfortunately|not to proceed|decided not to|not moving forward|other candidates|position has been filled|not been selected|לצערנו|לא נמשיך|לא התאים|מועמדים אחרים|המשרה אוישה|לא נוכל להתקדם/i],
  ['הצעה', /job offer|offer letter|pleased to offer|הצעת עבודה|שמחים להציע/i],
  ['ראיון', /interview|phone screen|schedule a (call|time)|your availability|available to talk|ראיון|זימון|לתאם שיחה|לקבוע שיחה|שיחת היכרות|מתי נוח/i],
  ['מטלה', /assessment|home assignment|technical test|coding challenge|מבחן|מטלה|מטלת בית/i],
  ['אישור הגשה', /thank you for applying|thank(s| you) for your interest|thanks for applying|קורות החיים .*התקבלו|application (was )?received|we received your application|candidate database|application was sent|קיבלנו את|פנייתך התקבלה|הגשת מועמדות|מועמדותך התקבלה/i],
  ['נצפה', /viewed your application|application was viewed|צפה במועמדות/i]
];
const STRIP_PHONES = (s) => String(s || '').replace(/(?:\+972|\b0)(?:[\s-]?\d){8,9}\b/g, '[מספר הוסר]');

function setup() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'runFeed') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('runFeed').timeBased().everyHours(1).create();
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ['גיליון1', 'Sheet1'].forEach((n) => { const sh = ss.getSheetByName(n); if (sh && ss.getSheets().length > 1 && sh.getLastRow() === 0) ss.deleteSheet(sh); });
  runFeed('30d');
}

function sheet_(name, header) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(header); sh.setFrozenRows(1); sh.setRightToLeft(true); }
  return sh;
}
function seen_(sh, col) {
  const n = sh.getLastRow();
  return new Set(n > 1 ? sh.getRange(2, col, n - 1, 1).getValues().map((r) => String(r[0])) : []);
}
function companyFrom_(email, subject) {
  const dom = (String(email).match(/@([^>\s]+)/) || [])[1] || '';
  const known = {};
  for (const k in known) if (dom.endsWith(k)) return known[k];
  const m = String(subject).match(/(?:at|from|to|ב-|מ-|ל-)\s*([A-Z][\w&.\- ]{1,30})/);
  if (m) return m[1].trim();
  return dom.replace(/^(mail|email|jobs|careers|hr|noreply|no-reply)\./, '').split('.')[0] || '';
}

function runFeed(lookback) {
  if (typeof lookback !== 'string') lookback = LOOKBACK;
  const ms = SpreadsheetApp.openById(SHEET_ID).getSheetByName('מיילים');
  if (!ms || ms.getLastRow() <= 1) lookback = '30d';   // empty sheet → look back a month
  const started = new Date();
  const st = sheet_('סטטוס', ['last_run', 'new_mails', 'new_jobs', 'seconds', 'error']);
  st.getRange(2, 1, 1, 5).setValues([[Utilities.formatDate(started, 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm') + ' (רץ…)', '', '', '', '']]);
  SpreadsheetApp.flush();
  try { runFeedInner_(started, st, lookback); }
  catch (e) { st.getRange(2, 5).setValue(String(e && e.message || e)); throw e; }
}

function runFeedInner_(started, st, lookback) {
  let label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const me = Session.getActiveUser().getEmail().toLowerCase();

  // 1) job mail → "מיילים"
  const mails = sheet_('מיילים', ['msg_id', 'thread_id', 'date', 'kind', 'company', 'from_domain', 'subject', 'link', 'direction']);
  const have = seen_(mails, 1);
  const q = `newer_than:${lookback} -in:spam -in:trash ((${SENDERS.map((s) => 'from:' + s).join(' OR ')}) OR subject:(${SUBJECT_WORDS.join(' OR ')}) OR label:"${LABEL}")`;
  const sentQ = `newer_than:${lookback} in:sent subject:(קורות OR "קו״ח" OR CV OR resume OR מועמדות OR משרה OR application OR "follow up" OR פולואפ OR "job")`;
  const rows = [];
  [[q, 'נכנס'], [sentQ, 'יוצא']].forEach(([query, dir]) => {
    GmailApp.search(query, 0, 60).forEach((th) => { try {
      let relevant = false;
      th.getMessages().forEach((m) => {
        const id = m.getId();
        const from = m.getFrom().toLowerCase();
        const mine = from.indexOf(me) >= 0;
        if (dir === 'יוצא' && !mine) return;
        const subject = m.getSubject() || '';
        const body = m.getPlainBody().slice(0, 4000);
        const text = subject + '\n' + body;
        if (/jobs you may|jobs for you|is hiring|apply now|new jobs|recommended jobs|משרות חדשות בשבילך/i.test(text) && !mine) return; // alerts are handled below
        relevant = true;
        if (have.has(id)) return;
        let kind = mine ? 'שלחת' : 'אחר';
        if (!mine) {
          for (const [k, re] of RULES) if (re.test(subject)) { kind = k; break; }       // the subject decides first
          if (kind === 'אחר') for (const [k, re] of RULES) if (re.test(text)) { kind = k; break; }
          if ((kind === 'ראיון' || kind === 'אחר') && RULES[4][1].test(subject + '\n' + body.slice(0, 600)) && !/schedule|availability|invite you|זימון|לתאם|מתי נוח/i.test(text)) kind = 'אישור הגשה';
        }
        const dom = (from.match(/@([^>\s]+)/) || [])[1] || '';
        rows.push([id, th.getId(), Utilities.formatDate(m.getDate(), 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm'), kind,
          mine ? companyFrom_((m.getTo().match(/@[^>\s,]+/) || [''])[0], subject) : companyFrom_(from, subject),
          mine ? ((m.getTo().match(/@([^>\s,]+)/) || [])[1] || '') : dom, STRIP_PHONES(subject).slice(0, 200),
          'https://mail.google.com/mail/u/0/#all/' + th.getId(), mine ? 'יוצא' : 'נכנס']);
        have.add(id);
      });
      if (relevant) th.addLabel(label);
    } catch (e) { console.warn('thread skipped', e); } });
  });
  if (rows.length) mails.getRange(mails.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

  // 2) LinkedIn job alerts → "משרות"
  const jobs = sheet_('משרות', ['job_id', 'seen', 'title', 'company', 'location', 'fit', 'link', 'mail_link']);
  const haveJobs = seen_(jobs, 1);
  const jrows = [];
  GmailApp.search(`newer_than:${lookback} in:anywhere from:(jobalerts-noreply@linkedin.com OR jobs-noreply@linkedin.com)`, 0, 30).forEach((th) => {
    th.getMessages().forEach((m) => {
      const lines = m.getPlainBody().split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      lines.forEach((l, i) => {
        const mm = l.match(/linkedin\.com\/(?:comm\/)?jobs\/view\/(\d+)/);
        if (!mm || haveJobs.has(mm[1])) return;
        const NOISE = /actively hiring|connection|apply with|easy apply|promoted|alumni|early applicant|applicant|reposted|ago$|school|verified|resume|benefit|^\$|₪|\bk\b|view job|^https?:|^-+$|top job|recruiting|hiring/i;
        const ctx = [];
        for (let k = i - 1; k >= 0 && ctx.length < 3; k--) {
          if (/linkedin\.com\/(?:comm\/)?jobs\/view/.test(lines[k])) break;
          if (!NOISE.test(lines[k])) ctx.unshift(lines[k]);
        }
        if (ctx.length < 3) return;
        const [title, company, location] = ctx;
        if (/view job|linkedin|^http/i.test(title + company)) return;
        const t = (title || '').toLowerCase();
        if (/senior|staff|principal|lead|manager|director|architect|\bsr\b|phd/.test(t)) return;
        const ai = /\bai\b|ml|machine learning|data|python|software|developer|engineer|qa|test|automation|llm|genai|בינה|דאטה|פיתוח|בודק|תוכנה/i.test(title);
        const junior = /junior|intern|student|graduate|entry|ג'וניור|ג׳וניור|סטודנט|בוגר|ללא ניסיון/i.test(title);
        const hw = /hardware|pcb|electrical|avionics|chip|asic|fpga|rf\b|חומרה|אלקטרוניקה/i.test(title);
        const fit = hw ? 'אולי' : (ai && junior) ? 'מתאים מאוד' : ai ? 'מתאים' : 'אולי';
        jrows.push([mm[1], Utilities.formatDate(m.getDate(), 'Asia/Jerusalem', 'yyyy-MM-dd'), title, company, location, fit, 'https://www.linkedin.com/jobs/view/' + mm[1] + '/', 'https://mail.google.com/mail/u/0/#all/' + th.getId()]);
        haveJobs.add(mm[1]);
      });
    });
  });
  if (jrows.length) jobs.getRange(jobs.getLastRow() + 1, 1, jrows.length, jrows[0].length).setValues(jrows);

  // 3) status
  st.getRange(2, 1, 1, 5).setValues([[Utilities.formatDate(started, 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm'), rows.length, jrows.length, Math.round((new Date() - started) / 1000), '']]);
}
