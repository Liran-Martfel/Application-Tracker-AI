/**
 * Lifecycle.gs — what happens to an application after it is sent (ninth file in the "Job Feed" project).
 * Runs every hour from runFeed, without Claude:
 *  1) a ✓ on an interview/assignment task in Google Tasks → "היה ראיון, מחכים לעדכון" (or the assignment was handed in)
 *  2) an interview whose date (from the mail) has passed → the same, so nothing waits for a ✓ forever
 *  3) a follow-up you sent in the application's mail thread → recorded on the application ("נשלח פולואפ"), the clock restarts
 *  4) 45 days with no news (no mail from the company, no update, no follow-up of yours) → the application goes to the archive;
 *     a new mail from the company brings it back
 * Uses readTab_/updateRow_/appendRow_/slug_/plusDays_/today_ (Api.gs) and taskListId_/BLOCKED/TASK_LIST (Code.gs).
 */
const ARCHIVE_DAYS = 45;          // a month and a half
const AFTER_INTERVIEW_FU = 7;     // a follow-up is worth it a week after an interview with no news

const lcDay_ = (d) => Utilities.formatDate(d instanceof Date ? d : new Date(d), 'Asia/Jerusalem', 'yyyy-MM-dd');
const lcShort_ = (s) => String(s).slice(8, 10) + '.' + String(s).slice(5, 7);
const lcDate_ = (v) => (v instanceof Date ? lcDay_(v) : String(v || '').slice(0, 10));

function lifecycle_() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) { console.warn('lifecycle: busy, skipped'); return { skipped: true }; }
  try {
    const A = API_TABS.applications.name, E = API_TABS.events.name;
    const apps = readTab_(A), events = readTab_(E), mails = readTab_('מיילים');
    const out = { done: 0, afterInterview: 0, followups: 0, archived: 0, back: 0 };
    const today = today_();
    const findApp = (company, role) => {
      const same = apps.filter((a) => slug_(a.company) === slug_(company) && a.status !== 'נדחה');
      if (role) { const r = same.filter((a) => slug_(a.role) === slug_(role)); if (r.length) return r[r.length - 1]; }
      return same.length === 1 ? same[0] : null;
    };
    const waitingEvents = (app, kinds) => events.filter((e) => /^true$/i.test(String(e.action)) && kinds.indexOf(e.kind) >= 0 &&
      ((app.thread_id && String(e.thread_id) === String(app.thread_id)) || slug_(e.company) === slug_(app.company)));
    const closeWaiting = (app, kinds, state) => waitingEvents(app, kinds).forEach((e) => { updateRow_(E, e.id, { action: false, mail_state: state }); e.action = false; e.mail_state = state; });
    const note = (app, kind, text, state) => appendRow_(E, { id: 'life-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), date: today, company: app.company, role: app.role, kind, text, link: app.link || '', action: false, mail_state: state || 'נקרא', thread_id: app.thread_id || '', msg_id: '' });
    const patch = (app, p) => { p.last_update = today; updateRow_(A, app.id, p); Object.assign(app, p); };

    // 1) ✓ in Google Tasks on an interview / assignment task this script made ("ראיון – Company (Role)")
    try { out.done = tasksDone_(findApp, (app, kind, when) => {
      if (kind === 'ראיון') { patch(app, { status: app.status === 'הצעה' ? 'הצעה' : 'ראיון', next_step: 'היה ראיון, מחכים לעדכון', followup_after: plusDays_(when, AFTER_INTERVIEW_FU) }); closeWaiting(app, ['ראיון'], 'נקרא'); note(app, 'ראיון', 'סימנת ✓ שהראיון התקיים. מחכים לעדכון מהחברה'); }
      else if (kind === 'מטלה') { patch(app, { next_step: 'המטלה הוגשה, מחכים לעדכון', followup_after: plusDays_(when, AFTER_INTERVIEW_FU) }); closeWaiting(app, ['התקדמות'], 'המטלה בוצעה'); note(app, 'התקדמות', 'סימנת ✓ שהמטלה הוגשה. מחכים לעדכון מהחברה', 'המטלה בוצעה'); }
    }); } catch (e) { console.warn('lifecycle: tasks', e); }

    // 2) an interview whose real date (it was in the mail, not an estimate) passed yesterday or before
    const props = PropertiesService.getScriptProperties(), all = props.getProperties();
    Object.keys(all).filter((k) => /^alert_/.test(k) && /\|ראיון\|/.test(k)).forEach((k) => {
      let o = null; try { o = JSON.parse(all[k]); } catch (e) { return; }
      if (!o || !o.at || /יעד משוער/.test(o.notes || '') || props.getProperty('passed_' + k)) return;
      if (o.at > Date.now() - 864e5) return;
      const m = String(o.what || '').match(/^ראיון – (.+?)(?: \((.+)\))?$/); if (!m) return;
      const app = findApp(m[1], m[2]);
      props.setProperty('passed_' + k, '1');
      if (!app || BLOCKED.test(app.company) || /היה ראיון/.test(app.next_step || '')) return;
      patch(app, { next_step: 'היה ראיון, מחכים לעדכון', followup_after: plusDays_(lcDay_(new Date(o.at)), AFTER_INTERVIEW_FU) });
      closeWaiting(app, ['ראיון'], 'נקרא'); note(app, 'ראיון', 'מועד הראיון עבר. מחכים לעדכון מהחברה'); out.afterInterview++;
    });

    // 3) follow-ups: a mail you sent in the application's thread, after the application day
    const byThread = {};
    mails.forEach((m) => { const t = String(m.thread_id || ''); if (t) (byThread[t] = byThread[t] || []).push(m); });
    apps.forEach((app) => {
      if (!app.thread_id || app.status === 'נדחה' || BLOCKED.test(app.company)) return;
      const sent = (byThread[String(app.thread_id)] || []).filter((m) => m.direction === 'יוצא' && lcDate_(m.date) > lcDate_(app.applied)).map((m) => lcDate_(m.date)).sort();
      const last = sent[sent.length - 1];
      if (!last || last <= lcDate_(app.followup_sent)) return;
      patch(app, { followup_sent: last, followup_after: '', next_step: 'נשלח פולואפ ב-' + lcShort_(last) + ', מחכים לתשובה' });
      note(app, 'פנייה', 'שלחת פולואפ ב-' + lcShort_(last), 'נשלח ממך'); out.followups++;
    });

    // 4) the archive: 45 days since the last sign of life (applied, an update, your follow-up, any mail in the thread)
    const lastLife = (app) => {
      const dates = [lcDate_(app.applied), lcDate_(app.followup_sent)];
      (byThread[String(app.thread_id || '')] || []).forEach((m) => dates.push(lcDate_(m.date)));
      events.forEach((e) => { if (!/^life-/.test(String(e.id)) && ((app.thread_id && String(e.thread_id) === String(app.thread_id)) || (slug_(e.company) === slug_(app.company) && slug_(e.role) === slug_(app.role)))) dates.push(lcDate_(e.date)); });
      return dates.filter(Boolean).sort().pop() || '';
    };
    const limit = lcDay_(new Date(Date.now() - ARCHIVE_DAYS * 864e5));
    apps.forEach((app) => {
      if (BLOCKED.test(app.company)) return;
      const archived = app.relevant === false || String(app.relevant).toLowerCase() === 'false';
      const life = lastLife(app), since = props.getProperty('archived_' + app.id);
      if (archived && since && life > since) {   // the company wrote again: back from the archive
        patch(app, { relevant: '', next_step: 'חזר מהארכיון: יש עדכון חדש' }); props.deleteProperty('archived_' + app.id);
        note(app, 'התקדמות', 'חזר מהארכיון: הגיע עדכון חדש'); out.back++; return;
      }
      if (archived || ['הוגש', 'בתהליך', 'ראיון'].indexOf(app.status) < 0 || !life || life >= limit) return;
      patch(app, { relevant: false, followup_after: '', next_step: 'בארכיון: חודש וחצי בלי תשובה (מאז ' + lcShort_(life) + ')' });
      props.setProperty('archived_' + app.id, today);
      note(app, 'התקדמות', 'הועבר לארכיון: חודש וחצי בלי תשובה מאז ' + lcShort_(life)); out.archived++;
    });
    console.log('lifecycle', JSON.stringify(out));
    return out;
  } finally { lock.releaseLock(); }
}

// completed tasks in the job-search list that this script made, each handled once
function tasksDone_(findApp, onDone) {
  if (typeof Tasks === 'undefined') return 0;
  const list = taskListId_(); if (!list) return 0;
  const props = PropertiesService.getScriptProperties();
  const items = (Tasks.Tasks.list(list, { showCompleted: true, showHidden: true, maxResults: 100, completedMin: new Date(Date.now() - 30 * 864e5).toISOString() }) || {}).items || [];
  let n = 0;
  items.forEach((t) => {
    if (t.status !== 'completed' || props.getProperty('done_' + t.id)) return;
    const m = String(t.title || '').match(/^(ראיון|מטלה) – (.+?)(?: \((.+)\))?$/);
    props.setProperty('done_' + t.id, '1');
    if (!m || BLOCKED.test(t.title)) return;
    const app = findApp(m[2], m[3]); if (!app) return;
    onDone(app, m[1], lcDay_(t.completed ? new Date(t.completed) : new Date())); n++;
  });
  return n;
}
