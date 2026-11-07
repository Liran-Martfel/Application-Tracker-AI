/**
 * Job Feed – runs on Google's servers every hour, for free, without Claude.
 * Reads job-search mail in Gmail, labels it "חיפוש עבודה", classifies it with simple rules
 * and writes it to the "Job Feed" Google Sheet, which the dashboard shows live.
 * It also collects new jobs from LinkedIn job-alert emails.
 * It never deletes or archives anything. The only mail it sends is the digest, to you only.
 *
 * Setup (once): Extensions are not needed. Paste this file, run `setup`, approve the permissions.
 */
const SHEET_ID = '{{SHEET_ID}}';
const LABEL = 'חיפוש עבודה';
const LOOKBACK = '3d';
// job-mail senders: recruiting systems and job boards. CHANGE: add the domains of companies the user applies to directly
const SENDERS = ['myworkday.com', 'greenhouse.io', 'lever.co', 'smartrecruiters.com', 'successfactors.com', 'icims.com', 'teamtailor-mail.com', 'comeet.co', 'comeet-notifications.com', 'hunterhrms.com', 'niloosoft.com', 'webcand.com', 'manatal.com', 'adamtotal.co.il', 'sparkhire.com', 'jobs-noreply@linkedin.com', 'noreply@google.com', 'noreply+jobs@google.com'];
const SUBJECT_WORDS = ['"your application"', '"thank you for applying"', '"application received"', '"thanks for applying"', '"we got it"', '"thank you for your application"', 'מועמדות', 'מועמדותך', '"קורות החיים"', 'interview', 'ראיון'];

const RULES = [
  ['דחייה', /unfortunately|not to proceed|decided not to|not moving forward|other candidates|position has been filled|not been selected|not (a|the right) (good )?fit|keep your (cv|resume|details) on file|future (opportunities|openings)|לצערנו|לא נמשיך|לא התאים|לא מתאימ|לא רלוונטי|לא נמצאת מתאים|לא נמצאת מתאימה|מישהו אחר|מועמדים אחרים|המשרה אוישה|לא נוכל להתקדם|נשמח לעדכן|נעדכן אותך|כשימצאו משרות|משרות מתאימות/i],
  ['הצעה', /job offer|offer letter|pleased to offer|הצעת עבודה|שמחים להציע/i],
  ['ראיון', /interview|phone screen|schedule a (call|time)|your availability|available to talk|ראיון|זימון|לתאם שיחה|לקבוע שיחה|שיחת היכרות|מתי נוח/i],
  ['מטלה', /assessment|home assignment|technical test|coding challenge|מבחן|מטלה|מטלת בית/i],
  ['אישור הגשה', /thank you for applying|thank(s| you) for your interest|thanks for applying|קורות החיים .*התקבלו|application (was )?received|we received your application|candidate database|application was sent|קיבלנו את|פנייתך התקבלה|הגשת מועמדות|מועמדותך התקבלה/i],
  ['נצפה', /viewed your application|application was viewed|צפה במועמדות/i]
];
const DASHBOARD = '{{SITE_URL}}/app';
const DIGEST_SUBJECT = 'סיכום מעקב הגשות';
const DIGEST_DAYS = [ScriptApp.WeekDay.SUNDAY, ScriptApp.WeekDay.TUESDAY, ScriptApp.WeekDay.THURSDAY];
const DIGEST_HOUR = 18;
// jobs that ask for more than about two years of experience ("2+ years", "3 years", "3 שנות ניסיון") are never recommended
const TOO_EXPERIENCED = /\b([2-9]|1\d)\s*\+\s*(years?|yrs?|שנ)|\b([3-9]|1\d)\s*(-\s*\d+\s*)?(years?|yrs?)\b|\b([3-9]|1\d)\s*(שנות|שנים)/i;
// general junior roles in software and AI (also wanted, after the target roles)
const JUNIOR_TECH = /(?=.*\b(junior|jr\.?|entry|graduate|associate)\b|.*ג['׳]?ו?ניור|.*מתחיל|.*בוגר)(?=.*\b(developer|engineer|software|python|data|machine learning|\bml\b|\bai\b|llm|backend|full.?stack|automation|scientist|analyst)\b|.*מפתח|.*מתכנת|.*תוכנה|.*דאטה|.*נתונים|.*בינה)/i;
// CHANGE: the user's target roles, as one regex on the job title (English and Hebrew). Example for AI solutions roles:
// /\bai\b.{0,12}solutions?\s+engineer|solutions?\s+architect|integration\s+engineer|מהנדס.{0,3}פתרונות/i
const TARGET_ROLES = /{{TARGET_ROLES_REGEX}}/i;
const STRIP_PHONES =(s) => String(s || '').replace(/(?:\+972|\b0)(?:[\s-]?\d){8,9}\b/g, '[מספר הוסר]');
// companies that are never recorded, tracked or alerted (for example where you already work). Example: /acme|globex/i
const BLOCKED = /{{BLOCKED_COMPANIES_REGEX}}/i;
const TASK_LIST = 'מערכת ניהול ומעקב משרות';   // the only Google Tasks list this project writes to

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
// recruiting systems that send mail for many companies: the company is in the subject, not in the sender
const ATS = /hunterhrms|manatal|smartrecruiters|webcand|adamtotal|comeet|greenhouse|lever\.co|myworkday|successfactors|icims|teamtailor|niloosoft|sparkhire|dialog/i;
const SUBJECT_CO = /\b(?:at|to|with|from)\s+([A-Z][\w&.'\- ]*?[\w&.])(?=\s*(?:[!.,:;()]|$)|\s[-–—]\s|\s+(?:has|is|was|for)\b)/;
function companyFromSubject_(subject) {
  const s = String(subject || '').replace(/\s+/g, ' ').trim();
  const pats = [
    /(?:לחברת|בחברת)\s+(.+?)(?=\s+(?:התקבלה|התקבל|התקבלו)(?:\s|$)|[,.!:;()]|$)/,   // "מועמדותך לחברת הפניקס התקבלה"
    /מועמדות(?:ך)?\s*[-–—:]\s*(.+)$/,                                               // "תודה על הגשת מועמדותך - אלביט מערכות"
    SUBJECT_CO,                                                                       // "Thank you for applying to SAP - please share…"
    /של\s+(.+?)\s*(?::-?\)|[!.,]|$)/,                                               // "…הבינה המלאכותית של ארד טק :-)"
  ];
  for (const re of pats) { const m = s.match(re); if (m && m[1].trim()) return m[1].trim().slice(0, 40); }
  return '';
}
function companyFrom_(email, subject, name, body) {
  const dom = (String(email).match(/@([^>\s]+)/) || [])[1] || '';
  const known = { 'amazon.jobs': 'Amazon', 'careers.microsoft.com': 'Microsoft', 'google.com': 'Google' };   // CHANGE: sender domain → company name
  for (const k in known) if (dom.endsWith(k)) return known[k];
  if (ATS.test(dom)) {
    // the sender's display name often is the company, e.g. "Rise via Comeet"
    const n = String(name || '').replace(/<.*>/, '').replace(/["']/g, '').replace(/\s+via\s+.*$/i, '').trim();
    const fromName = !n || ATS.test(n) || /no-?reply|notification|jobs|careers|recruit|talent|team|\bhr\b/i.test(n) ? '' : n;
    const byLine = (String(body || '').slice(0, 300).match(/([^\n]{2,40}?)\s+by\s+(?:webcand|comeet|manatal)/i) || [])[1];   // "Example Company By Webcand"
    return companyFromSubject_(subject) || (byLine || '').trim() || fromName;
  }
  const m = String(subject).match(SUBJECT_CO);
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
  try { applyMailsToTracker_(); }
  catch (e) { console.warn('tracker update failed', e); st.getRange(2, 5).setValue('עדכון ההגשות נכשל: ' + String(e && e.message || e)); }
  try { purgeBlocked_(); } catch (e) { console.warn('purge failed', e); }
  try { backfillTasks_(); } catch (e) { console.warn('tasks backfill failed', e); }
  // no-Claude automations in their own files: Leads.gs, Prep.gs, Visitors.gs, Watchdog.gs (Gemini steps skip quietly without GEMINI_KEY)
  try { scoreNewLeads_(); } catch (e) { console.warn('lead scoring failed', e); }
  try { prepInterviews_(2); } catch (e) { console.warn('interview prep failed', e); }
  try { followupDrafts_(3); } catch (e) { console.warn('follow-up drafts failed', e); }
  try { siteActivity_(); } catch (e) { console.warn('site activity failed', e); }
  try { backupSheet_(); } catch (e) { console.warn('backup failed', e); }
}

/* ===== מיילים → הגשות ואירועים, בלי Claude (רץ אחרי runFeed) =====
   משתמש ב-readTab_, appendRow_, updateRow_, slug_ ו-plusDays_ מ-Api.gs (אותו פרויקט).
   מייל שכבר נכנס לאירועים (לפי msg_id) לא נכנס שוב, כך שאפשר להריץ שוב ושוב בלי כפילויות. */
const TRACK_ORDER = ['הוגש', 'בתהליך', 'ראיון', 'הצעה'];
const MAIL_STATUS = { 'מטלה': 'בתהליך', 'נצפה': 'בתהליך', 'ראיון': 'ראיון', 'הצעה': 'הצעה', 'דחייה': 'נדחה' };
const MAIL_EVENT = { 'מטלה': 'התקדמות', 'נצפה': 'התקדמות', 'ראיון': 'ראיון', 'הצעה': 'הצעה', 'דחייה': 'דחייה' };
const MAIL_NEXT = { 'מטלה': 'להגיש את המטלה', 'ראיון': 'לתאם ראיון', 'הצעה': 'לענות להצעה' };
const CHANNELS = [[/linkedin\./, 'LinkedIn'], [/comeet/, 'Comeet'], [/hunterhrms/, 'Hunter'], [/jobmaster/, 'JobMaster'], [/alljobs/, 'AllJobs'], [/drushim/, 'דרושים'], [/niloosoft/, 'Niloosoft'],
  [/greenhouse|lever\.co|myworkday|smartrecruiters|successfactors|icims|teamtailor|amazon\.jobs|careers\./, 'אתר החברה']];
const TRACK_DAYS = 14;

function applyMailsToTracker_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { console.warn('tracker: busy, skipped'); return { skipped: true }; }
  try {
    const A = API_TABS.applications.name, E = API_TABS.events.name;
    const apps = readTab_(A), events = readTab_(E);
    const cutoff = Utilities.formatDate(new Date(Date.now() - TRACK_DAYS * 864e5), 'Asia/Jerusalem', 'yyyy-MM-dd');
    const mails = readTab_('מיילים').filter((m) => m.direction === 'נכנס' && String(m.date).slice(0, 10) >= cutoff && !BLOCKED.test([m.company, m.from_domain, m.subject].join(' ')))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const seenMsg = new Set(events.map((e) => String(e.msg_id)).filter(Boolean));
    const submitted = new Set(events.filter((e) => e.kind === 'הגשה' && e.thread_id).map((e) => String(e.thread_id)));
    const byThread = {}; apps.forEach((a) => { if (a.thread_id) byThread[String(a.thread_id)] = a; });
    const low = (x) => String(x || '').toLowerCase().replace(/\s+/g, ' ').trim();
    // the application whose role is named in the subject; else one applied within `days` days; else the company's only open one
    const matchApp = (company, subject, day, days) => {
      const same = apps.filter((a) => slug_(a.company) === slug_(company));
      const byRole = same.filter((a) => low(a.role).length > 4 && low(subject).indexOf(low(a.role)) >= 0);
      if (byRole.length) return byRole[byRole.length - 1];
      if (days) return same.find((a) => Math.abs(new Date(a.applied) - new Date(day)) <= days * 864e5) || null;
      const open = same.filter((a) => a.status !== 'נדחה');
      return open.length === 1 ? open[0] : null;
    };
    const out = { updated: 0, events: 0, added: 0, alerts: 0 };

    mails.forEach((m) => {
      const msg = String(m.msg_id), thread = String(m.thread_id), day = String(m.date).slice(0, 10);
      if (!msg || seenMsg.has(msg)) return;
      // older rows hold the recruiting system's name (hunterhrms, manatal…) instead of the company
      let company = String(m.company || '').split(/\s[-–—]\s/)[0].trim();
      if (ATS.test(String(m.from_domain || '')) && (!company || ATS.test(company))) company = companyFromSubject_(m.subject);
      const app = byThread[thread] || (MAIL_STATUS[m.kind] && m.kind !== 'דחייה' && company ? matchApp(company, m.subject, day, 0) : null);
      const text = STRIP_PHONES(m.subject || '').slice(0, 200);
      const event = (a, kind, state, action) => {
        appendRow_(E, { id: 'mail-' + msg, date: day, company: a.company, role: a.role, kind, text, link: m.link, action, mail_state: state, thread_id: thread, msg_id: msg });
        seenMsg.add(msg); out.events++;
        if (action) {
          try { if (alertImportant_({ kind: m.kind, company: a.company, role: a.role, subject: m.subject || '', link: m.link, thread, msg })) out.alerts++; }
          catch (e) { console.warn('alert failed', e); }
        }
      };

      if (app && MAIL_STATUS[m.kind]) {
        const want = MAIL_STATUS[m.kind], cur = String(app.status || 'הוגש');
        let patch = null;
        if (want === 'נדחה' && cur !== 'נדחה') patch = { status: 'נדחה', next_step: '', followup_after: '' };
        else if (cur !== 'נדחה' && TRACK_ORDER.indexOf(want) > TRACK_ORDER.indexOf(cur)) {   // only forward, never down
          patch = { status: want, next_step: MAIL_NEXT[m.kind] || app.next_step || '' };
          if (want === 'בתהליך') patch.followup_after = plusDays_(day, 10);
        }
        if (patch) { patch.last_update = day; updateRow_(A, app.id, patch); Object.assign(app, patch); out.updated++; }
        event(app, MAIL_EVENT[m.kind], 'לא נקרא — כדאי להיכנס', ['ראיון', 'מטלה', 'הצעה'].indexOf(m.kind) >= 0);
        return;
      }

      // an interview, assignment or offer that matches no application still shows up, so it isn't missed
      if (['ראיון', 'מטלה', 'הצעה'].indexOf(m.kind) >= 0) {
        event({ company: company || 'לא ידוע (' + (m.from_domain || 'מייל') + ')', role: 'לא צוין' }, MAIL_EVENT[m.kind], 'לא נקרא — כדאי להיכנס', true);
        return;
      }

      if (m.kind === 'אישור הגשה' && !app && company && !submitted.has(thread)) {
        // the application may be in the tracker already without this thread: the role is in the subject, or same company within 3 days
        const near = matchApp(company, m.subject, day, 3);
        if (near) { if (!near.thread_id) updateRow_(A, near.id, { thread_id: thread }); near.thread_id = thread; byThread[thread] = near; event(near, 'הגשה', 'נקרא', false); submitted.add(thread); return; }
        const dom = String(m.from_domain || '').toLowerCase();
        const channel = (CHANNELS.find(([re]) => re.test(dom)) || [null, 'מייל'])[1];
        const a = { id: slug_(company) + '-' + msg.slice(-6), company, role: 'לא צוין', job_id: '', channel, applied: day, status: 'הוגש', last_update: day,
          next_step: 'ממתין לתגובה', note: 'נוסף אוטומטית מ-Gmail', link: m.link, thread_id: thread, level: '', origin: /\.co\.il$/.test(dom) || /[֐-׿]/.test(company) ? 'ישראלית' : '',
          cv_version: '', followup_after: plusDays_(day, 10), followup_draft: '', followup_sent: '', direct_contact: '', direct_contact_note: '', relevant: '' };
        appendRow_(A, a); apps.push(a); byThread[thread] = a; out.added++;
        event(a, 'הגשה', 'נקרא', false); submitted.add(thread);
      }
    });
    console.log('tracker', JSON.stringify(out));
    return out;
  } finally { lock.releaseLock(); }
}

/* ===== התראות ביומן Google ובמשימות Google, בלי Claude =====
   על כל ראיון, מטלה או הצעה חדשים: התראה מיידית, שבוע לפני (ראיון), יומיים לפני, בבוקר של היום, ומשימה עם תאריך יעד.
   Google Tasks צריך הפעלה חד-פעמית בעורך: Services (+) → Google Tasks API → Add. */
const ALERT_HOUR = 10, MORNING_HOUR = 8;
const ALERT_DAYS = { 'ראיון': 2, 'מטלה': 3, 'הצעה': 2 };   // the deadline when the mail names no date
const ALERT_WORD = { 'ראיון': 'ראיון', 'מטלה': 'מטלה', 'הצעה': 'הצעת עבודה' };

function roleFromSubject_(s) {
  return ((String(s || '').match(/(?:למשרת|משרת|for the|position of|role of)\s+(.+?)(?:\s+position)?\s*$/i) || [])[1] || '').trim().slice(0, 60);
}
// the first future date in the mail (12/11, 12.11.2026…) with the time next to it, if any
function dateFromMail_(text, now) {
  const t = String(text || ''), re = /\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\b/g;
  let m;
  while ((m = re.exec(t))) {
    const d = +m[1], mo = +m[2], y = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : now.getFullYear();
    if (d < 1 || d > 31 || mo < 1 || mo > 12) continue;
    const tm = t.slice(Math.max(0, m.index - 25), m.index + 40).match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const at = new Date(y, mo - 1, d, tm ? +tm[1] : ALERT_HOUR, tm ? +tm[2] : 0);
    if (!m[3] && at < now) at.setFullYear(y + 1);
    if (at > now && at - now < 90 * 864e5) return { at, timed: !!tm };
  }
  // English: "Nov 4, 2026 2pm", "4 November 2026 14:00"
  const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const en = /\b(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s*(\d{1,2})(?!\d))?(?:,?\s+(\d{4}))?(?:[^\n\d]{0,12}(\d{1,2})(?!\d)(?::(\d{2}))?\s*(am|pm)?)?/gi;
  while ((m = en.exec(t))) {
    const d = +(m[1] || m[3]), mo = MON[m[2].toLowerCase()], y = m[4] ? +m[4] : now.getFullYear();
    if (!d || d > 31) continue;
    const timed = !!m[5] && !!(m[6] || m[7]);   // a bare number after the date is not a time
    let h = timed ? +m[5] : ALERT_HOUR; if (timed && m[7] && /pm/i.test(m[7]) && h < 12) h += 12;
    const at = new Date(y, mo, d, h, timed && m[6] ? +m[6] : 0);
    if (!m[4] && at < now) at.setFullYear(y + 1);
    if (at > now && at - now < 90 * 864e5) return { at, timed };
  }
  return null;
}

// a reminder mail for the same job gets the same key, so it doesn't alert twice
function alertKey_(company, kind, role, thread) { return 'alert_' + slug_(company) + '|' + kind + '|' + (role ? slug_(role) : thread); }

function alertImportant_(o) {
  if (/^(updated |new )?(invitation|event)( updated)?:|^הזמנה( מעודכנת)?:/i.test(o.subject)) return false;   // a calendar invite is already in the calendar
  if (BLOCKED.test(o.company + ' ' + o.subject)) return false;
  const props = PropertiesService.getScriptProperties();
  const role = o.role && o.role !== 'לא צוין' ? o.role : roleFromSubject_(o.subject);
  const key = alertKey_(o.company, o.kind, role, o.thread);
  if (props.getProperty(key)) return false;
  const now = new Date();
  let body = '';
  try { body = GmailApp.getMessageById(o.msg).getPlainBody().slice(0, 6000); } catch (e) {}
  const found = dateFromMail_(o.subject + '\n' + body, now);
  const at = found ? found.at : new Date(now.getFullYear(), now.getMonth(), now.getDate() + ALERT_DAYS[o.kind], ALERT_HOUR, 0);
  const what = ALERT_WORD[o.kind] + ' – ' + o.company + (role ? ' (' + role + ')' : '');
  const notes = (found ? '' : 'התאריך לא הופיע במייל, זה יעד משוער. כדאי לבדוק במייל.\n') + 'המייל: ' + o.link + '\nהדשבורד: ' + DASHBOARD;
  props.setProperty(key, JSON.stringify({ at: at.getTime(), what, notes }));
  const cal = CalendarApp.getDefaultCalendar();
  // 1) right away
  const soon = new Date(now.getTime() + 2 * 60000);
  const e1 = cal.createEvent('📬 הגיע: ' + what, soon, new Date(soon.getTime() + 15 * 60000), { description: notes });
  e1.removeAllReminders(); e1.addPopupReminder(0);
  // 2-4) the day itself: a week before (interviews), two days before, and that morning
  const e2 = cal.createEvent((found ? '📅 ' : '⏳ יעד: ') + what, at, new Date(at.getTime() + 60 * 60000), { description: notes });
  e2.removeAllReminders();
  const before = (min) => { if (at.getTime() - min * 60000 > soon.getTime()) e2.addPopupReminder(min); };
  if (o.kind === 'ראיון') before(7 * 24 * 60);
  before(2 * 24 * 60);
  const morning = new Date(at.getFullYear(), at.getMonth(), at.getDate(), MORNING_HOUR, 0);
  if (morning < at) before(Math.round((at - morning) / 60000));
  // + a task with the due date
  try { ensureTask_(key, what, notes, at); }
  catch (e) { console.warn('Google Tasks is not enabled in Services', e); }
  return true;
}

function taskListId_() {
  const props = PropertiesService.getScriptProperties();
  const cached = props.getProperty('tasklist_id');
  if (cached) return cached;
  const list = ((Tasks.Tasklists.list({ maxResults: 100 }) || {}).items || []).find((l) => String(l.title || '').trim() === TASK_LIST);
  if (!list) { console.warn('אין ב-Google Tasks רשימה בשם "' + TASK_LIST + '"'); return null; }
  props.setProperty('tasklist_id', list.id);
  return list.id;
}
// one task per alert, only in the job-search list
function ensureTask_(key, what, notes, at) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('task_' + key)) return false;
  const list = taskListId_();
  if (!list) return false;
  Tasks.Tasks.insert({ title: what, notes, due: Utilities.formatDate(at, 'Asia/Jerusalem', 'yyyy-MM-dd') + 'T00:00:00.000Z' }, list);
  props.setProperty('task_' + key, '1');
  return true;
}
// alerts from before Google Tasks was enabled get their task now (still-open ones only)
function backfillTasks_() {
  if (typeof Tasks === 'undefined') return 0;
  const props = PropertiesService.getScriptProperties();
  const KIND = { 'ראיון': 'ראיון', 'התקדמות': 'מטלה', 'הצעה': 'הצעה' };
  let n = 0;
  readTab_(API_TABS.events.name).forEach((e) => {
    const kind = KIND[e.kind];
    if (!kind || !/^true$/i.test(String(e.action)) || BLOCKED.test(e.company + ' ' + e.text)) return;
    const role = e.role && e.role !== 'לא צוין' ? e.role : roleFromSubject_(e.text);
    const key = alertKey_(e.company, kind, role, e.thread_id), v = props.getProperty(key);
    if (!v || props.getProperty('task_' + key)) return;
    let o = null; try { o = JSON.parse(v); } catch (x) {}
    const made = new Date(Number(v));   // older alerts kept only the time they were made
    const at = o && o.at ? new Date(o.at) : new Date(made.getFullYear(), made.getMonth(), made.getDate() + ALERT_DAYS[kind], ALERT_HOUR, 0);
    if (at < new Date(Date.now() - 864e5)) return;
    const what = (o && o.what) || (ALERT_WORD[kind] + ' – ' + e.company + (role ? ' (' + role + ')' : ''));
    const notes = (o && o.notes) || ('המייל: ' + e.link + '\nהדשבורד: ' + DASHBOARD);
    try { if (ensureTask_(key, what, notes, at)) n++; } catch (x) { console.warn('task failed', x); }
  });
  return n;
}

// once: remove what was already recorded about blocked companies, and the alerts and tasks this script made for them
function purgeBlocked_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('purged_v') === '1') return;
  const ss = SpreadsheetApp.openById(SHEET_ID);
  ['מיילים', API_TABS.events.name, API_TABS.applications.name, 'משרות'].forEach((name) => {
    const sh = ss.getSheetByName(name);
    if (!sh || sh.getLastRow() < 2) return;
    const rows = sh.getDataRange().getValues();
    for (let i = rows.length - 1; i >= 1; i--) if (BLOCKED.test(rows[i].join(' '))) sh.deleteRow(i + 1);
  });
  const ours = /^(📬 הגיע: |⏳ יעד: |📅 )?(ראיון|מטלה|הצעת עבודה) – /;   // only titles this script writes
  const now = Date.now();
  CalendarApp.getDefaultCalendar().getEvents(new Date(now - 30 * 864e5), new Date(now + 90 * 864e5))
    .filter((e) => ours.test(e.getTitle()) && BLOCKED.test(e.getTitle())).forEach((e) => e.deleteEvent());
  if (typeof Tasks !== 'undefined') ['@default', taskListId_()].filter(Boolean).forEach((list) => {
    ((Tasks.Tasks.list(list, { showCompleted: false }) || {}).items || []).filter((t) => ours.test(t.title || '') && BLOCKED.test(t.title || '')).forEach((t) => Tasks.Tasks.remove(list, t.id));
  });
  props.setProperty('purged_v', '1');
}

function runFeedInner_(started, st, lookback) {
  let label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  const me = Session.getActiveUser().getEmail().toLowerCase();

  // 1) job mail → "מיילים"
  const mails = sheet_('מיילים', ['msg_id', 'thread_id', 'date', 'kind', 'company', 'from_domain', 'subject', 'link', 'direction']);
  const have = seen_(mails, 1);
  const q = `newer_than:${lookback} -in:spam -in:trash -subject:"${DIGEST_SUBJECT}" ((${SENDERS.map((s) => 'from:' + s).join(' OR ')}) OR subject:(${SUBJECT_WORDS.join(' OR ')}) OR label:"${LABEL}")`;
  const sentQ = `newer_than:${lookback} in:sent -subject:"${DIGEST_SUBJECT}" subject:(קורות OR "קו״ח" OR CV OR resume OR מועמדות OR משרה OR application OR "follow up" OR פולואפ OR "job")`;
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
        if (BLOCKED.test(from + ' ' + m.getTo() + '\n' + text)) return;                                   // not part of the job search
        relevant = true;
        if (have.has(id)) return;
        let kind = mine ? 'שלחת' : 'אחר';
        if (!mine) {
          for (const [k, re] of RULES) if (re.test(subject)) { kind = k; break; }       // the subject decides first
          if (kind === 'אחר') for (const [k, re] of RULES) if (re.test(text)) { kind = k; break; }
          // a confirmation that mentions interviews stays a confirmation, unless the subject itself is about an interview
          if ((kind === 'ראיון' || kind === 'אחר') && !(kind === 'ראיון' && RULES[2][1].test(subject)) && RULES[4][1].test(subject + '\n' + body.slice(0, 600)) && !/schedule|availability|invite you|זימון|לתאם|מתי נוח/i.test(text)) kind = 'אישור הגשה';
        }
        const dom = (from.match(/@([^>\s]+)/) || [])[1] || '';
        rows.push([id, th.getId(), Utilities.formatDate(m.getDate(), 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm'), kind,
          mine ? companyFrom_((m.getTo().match(/@[^>\s,]+/) || [''])[0], subject) : companyFrom_(from, subject, m.getFrom(), body),
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
  const normT = (x) => String(x || '').toLowerCase().replace(/\(.*?\)|[-–|,.:;'"׳״]/g, ' ').replace(/\b(tel ?aviv|haifa|israel|raanana|herzliya|petah tikva|jerusalem)\b/g, '').replace(/\s+/g, ' ').trim();
  const haveKeys = new Set();
  if (jobs.getLastRow() > 1) jobs.getRange(2, 3, jobs.getLastRow() - 1, 2).getValues().forEach((r) => haveKeys.add(normT(r[1]) + '|' + normT(r[0])));
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
        // the owner's target roles (TARGET_ROLES at the top)
        const target = TARGET_ROLES.test(title);
        if (/senior|staff|principal|\blead\b|director|head of|\bvp\b|\bsr\b|phd|מנוסה|בכיר/.test(t)) return;
        if (TOO_EXPERIENCED.test(title)) return;   // asks for 2+ years of experience: never recommended
        if (/manager|מנהל/.test(t) && !/product manager|מנהל.{0,3}מוצר/.test(t)) return;          // product managers stay
        if (/architect|ארכיטקט/.test(t) && !/solutions? architect|ארכיטקט.{0,3}פתרונות/.test(t)) return;   // solutions architects stay
        // CV filter: titles that name languages/areas the owner doesn't know are skipped
        if (/{{SKIP_TITLE_WORDS_REGEX}}/i.test(title)) return;
        const key = normT(company) + '|' + normT(title);
        if (haveKeys.has(key)) return;                 // same job again (other LinkedIn id) — keep one
        if (BLOCKED.test(company + ' ' + title)) return;
        // the five target roles are the strongest fit; general junior roles in software and AI are a fit too
        const fit = target ? 'מתאים מאוד' : JUNIOR_TECH.test(title) ? 'מתאים' : 'אולי';
        haveKeys.add(key);
        jrows.push([mm[1], Utilities.formatDate(m.getDate(), 'Asia/Jerusalem', 'yyyy-MM-dd'), title, company, location, fit, 'https://www.linkedin.com/jobs/view/' + mm[1] + '/', 'https://mail.google.com/mail/u/0/#all/' + th.getId()]);
        haveJobs.add(mm[1]);
      });
    });
  });
  if (jrows.length) jobs.getRange(jobs.getLastRow() + 1, 1, jrows.length, jrows[0].length).setValues(jrows);

  // 3) status
  st.getRange(2, 1, 1, 5).setValues([[Utilities.formatDate(started, 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm'), rows.length, jrows.length, Math.round((new Date() - started) / 1000), '']]);
}

/* ===== מייל סיכום — ראשון, שלישי וחמישי ב-18:00, ממך אליך. לא שולח לאף אחד אחר. ===== */
function setupDigest() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'sendDigest') ScriptApp.deleteTrigger(t); });
  DIGEST_DAYS.forEach((d) => ScriptApp.newTrigger('sendDigest').timeBased().onWeekDay(d).atHour(DIGEST_HOUR).nearMinute(0).inTimezone('Asia/Jerusalem').create());
  return 'מייל הסיכום יישלח בימים ראשון, שלישי וחמישי ב-' + DIGEST_HOUR + ':00';
}

function sendDigest() {
  try { runFeed(); } catch (e) { console.warn('feed before digest failed', e); }   // הנתונים הכי עדכניים
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const props = PropertiesService.getScriptProperties();
  const now = new Date();
  const since = new Date(Number(props.getProperty('digest_last')) || (now.getTime() - 3 * 864e5));
  const fmt = (d) => Utilities.formatDate(d, 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm');
  const sinceS = fmt(since), sinceDay = sinceS.slice(0, 10);
  const rows = (name) => { const sh = ss.getSheetByName(name); if (!sh || sh.getLastRow() < 2) return []; const [h, ...r] = sh.getDataRange().getValues(); return r.map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] instanceof Date ? fmt(x[i]) : String(x[i] ?? '')]))); };
  const me = Session.getActiveUser().getEmail();
  // קישור ישיר לשרשור בחשבון שלך — בלי מעבר דרך /u/0 ובחירת חשבון
  const mailLink = (t) => 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(me) + '#all/' + t;
  const mails = rows('מיילים').map((m) => ({ ...m, link: m.thread_id ? mailLink(m.thread_id) : m.link })), jobs = rows('משרות');
  const esc = (t) => String(t || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const NOT_FIT = /לא\s*מתאימ|לא\s*רלוונטי|לא\s*נמצא|מישהו\s*אחר|מועמדים\s*אחרים|נשמח\s*לעדכן|משרות\s*מתאימות|not\s+a\s+fit|other\s+candidates/i;

  // שרשורים שבהם ענית אחרי ההודעה האחרונה שלהם
  const byThread = {};
  mails.forEach((m) => { (byThread[m.thread_id] = byThread[m.thread_id] || []).push(m); });
  const answered = (m) => (byThread[m.thread_id] || []).some((x) => x.direction === 'יוצא' && x.date > m.date);

  // 1) מחכה לתגובה שלך: ראיון / מטלה / הצעה מ-14 הימים האחרונים שעוד לא ענית עליהם
  const day14 = Utilities.formatDate(new Date(now.getTime() - 14 * 864e5), 'Asia/Jerusalem', 'yyyy-MM-dd');
  const waiting = mails.filter((m) => m.direction === 'נכנס' && ['ראיון', 'מטלה', 'הצעה'].includes(m.kind) && m.date >= day14 && !answered(m));
  // 2) מה הגיע מאז הסיכום הקודם
  const fresh = mails.filter((m) => m.direction === 'נכנס' && m.date > sinceS && m.kind !== 'אחר');
  const waitIds = new Set(waiting.map((m) => m.msg_id));
  const good = fresh.filter((m) => ['ראיון', 'מטלה', 'הצעה', 'נצפה'].includes(m.kind) && !waitIds.has(m.msg_id));
  const confirm = fresh.filter((m) => m.kind === 'אישור הגשה');
  const rejThreads = new Set();
  const rejected = fresh.filter((m) => (m.kind === 'דחייה' || NOT_FIT.test(m.subject)) && !rejThreads.has(m.thread_id) && rejThreads.add(m.thread_id));
  // 3) הגשות שלך בלי שום תשובה כבר 10 ימים ויותר (לפולואפ)
  const day10 = Utilities.formatDate(new Date(now.getTime() - 10 * 864e5), 'Asia/Jerusalem', 'yyyy-MM-dd');
  const day30 = Utilities.formatDate(new Date(now.getTime() - 30 * 864e5), 'Asia/Jerusalem', 'yyyy-MM-dd');
  const seenCo = new Set();
  const quiet = mails.filter((m) => m.direction === 'יוצא' && m.date.slice(0, 10) <= day10 && m.date.slice(0, 10) >= day30 &&
    !(byThread[m.thread_id] || []).some((x) => x.direction === 'נכנס' && x.date > m.date))
    .filter((m) => { const k = (m.company || m.from_domain).toLowerCase(); if (!k || seenCo.has(k)) return false; seenCo.add(k); return true; });
  // 4) משרות חדשות: ספירה; המשרות ש-Gemini דירג גבוה מופיעות ברשימה "משרות שכדאי להגיש"
  const newJobs = jobs.filter((j) => j.seen >= sinceDay && j.fit === 'מתאים מאוד');
  let strong = [], site = { visits: 0, cv: 0, contacts: 0, questions: [] }, wd = { ok: true, problems: [] };
  try { strong = leadsForDigest_(sinceDay); } catch (e) { console.warn(e); }
  try { site = visitorsForDigest_(since.getTime()); } catch (e) { console.warn(e); }
  try { wd = watchdogStatus_(); } catch (e) { console.warn(e); }

  const li = (m) => `<li><b dir="auto">${esc(m.company || m.from_domain)}</b> — <a href="${esc(m.link)}" dir="auto">${esc(m.subject || '(בלי נושא)')}</a> <span style="color:#777">· ${esc(m.kind)} · ${esc(m.date.slice(8, 10) + '.' + m.date.slice(5, 7))}</span></li>`;
  const sec = (title, list, render, empty) => (list.length ? `<h3 style="margin:18px 0 6px">${title} (${list.length})</h3><ul style="margin:0;padding-inline-start:20px">${list.map(render).join('')}</ul>` : (empty ? `<p style="color:#777">${empty}</p>` : ''));
  const html = `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1d2433;max-width:640px">
  <h2 style="margin:0 0 4px">📬 ${DIGEST_SUBJECT}</h2>
  <p style="color:#777;margin:0 0 10px">מאז ${esc(sinceS.slice(8, 10) + '.' + sinceS.slice(5, 7) + ' ' + sinceS.slice(11))} · נוצר אוטומטית בלי Claude</p>
  ${sec('🔔 מחכה לתגובה שלך', waiting, li, '')}
  ${sec('✨ עדכונים טובים', good, li, '')}
  ${sec('❌ דחיות ו"לא מתאים"', rejected, li, '')}
  ${sec('📨 אישורי הגשה', confirm, li, '')}
  ${sec('⏰ שווה פולואפ — 10+ ימים בלי תשובה', quiet.slice(0, 8), (m) => `<li><b dir="auto">${esc(m.company || m.from_domain)}</b> — <a href="${esc(m.link)}" dir="auto">${esc(m.subject)}</a> <span style="color:#777">· נשלח ${esc(m.date.slice(8, 10) + '.' + m.date.slice(5, 7))}</span></li>`, '')}
  ${newJobs.length ? `<p style="margin:18px 0 6px">🆕 ${newJobs.length} משרות חדשות מההתראות בתפקידי היעד — עם תיאור התפקיד והמיקום ב<a href="${DASHBOARD}#leads">דשבורד, בכרטיס "משרות שכדאי להגיש"</a>.</p>` : ''}
  ${sec('🎯 משרות שכדאי להגיש', strong.slice(0, 8), (l) => `<li><b dir="auto">${esc(l.company)}</b> — <a href="${esc(l.link)}" dir="auto">${esc(l.role)}</a> <span style="color:#777">· ${esc(l.score)} · ${esc(l.why)}</span></li>`, '')}
  ${site.visits || site.cv ? `<p style="margin:18px 0 6px">👀 באתר: ${site.visits} ביקורים, ${site.cv} הורדות קורות חיים, ${site.contacts} לחיצות וואטסאפ/מייל · <a href="${DASHBOARD}#visitors">פרטים בדשבורד</a></p>` : ''}
  ${site.questions && site.questions.length ? `<p style="margin:6px 0;color:#555">שאלו בצ׳אט: ${site.questions.slice(0, 5).map((q) => '„' + esc(q) + '“').join(' · ')}</p>` : ''}
  ${wd.ok ? '' : `<p style="margin:18px 0 6px;color:#b42318">⚠️ ${wd.problems.map((p) => esc(p.title)).join(' · ')}</p>`}
  ${!waiting.length && !fresh.length && !newJobs.length && !quiet.length && !strong.length ? '<p>שקט מאז הסיכום הקודם — אין מיילים חדשים על ההגשות ואין משרות חדשות.</p>' : ''}
  <p style="margin-top:22px"><a href="${DASHBOARD}" style="background:#1f3a68;color:#fff;padding:9px 16px;border-radius:10px;text-decoration:none">לפתוח את הדשבורד</a></p>
  </div>`;
  const text = `${DIGEST_SUBJECT}: מחכה לתגובה ${waiting.length}, עדכונים טובים ${good.length}, דחיות ${rejected.length}, אישורי הגשה ${confirm.length}, פולואפים ${quiet.length}, משרות חדשות ${newJobs.length}, משרות מומלצות ${strong.length}, הורדות קורות חיים ${site.cv}. ${DASHBOARD}`;
  const n = waiting.length + good.length;
  GmailApp.sendEmail(me, DIGEST_SUBJECT + ' · ' + Utilities.formatDate(now, 'Asia/Jerusalem', 'dd.MM') + (n ? ' · ' + (n === 1 ? 'דבר אחד דורש תשומת לב' : n + ' דורשים תשומת לב') : ''), text, { htmlBody: html, name: 'מעקב הגשות' });
  props.setProperty('digest_last', String(now.getTime()));
}
