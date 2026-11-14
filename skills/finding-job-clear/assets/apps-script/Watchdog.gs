/**
 * Watchdog.gs — makes sure the automation never fails silently, plus a weekly copy of the Sheet.
 * Run setupWatchdog() once: watchdog() then checks the "סטטוס" tab every 3 hours and alerts on the phone (notify_).
 * backupSheet_() is called from runFeed; it copies the Sheet at most once every 7 days and keeps the 8 newest copies.
 */
const WATCHDOG_HOURS = 3;                        // a run older than this = a problem
const BACKUP_FOLDER = 'Job Feed – גיבויים';
const BACKUP_PREFIX = 'Job Feed גיבוי ';
const BACKUP_KEEP = 8, BACKUP_DAYS = 7;

function setupWatchdog() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (t.getHandlerFunction() === 'watchdog') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('watchdog').timeBased().everyHours(WATCHDOG_HOURS).create();
  watchdog();
}

// 'yyyy-MM-dd HH:mm' (Israel time, maybe with " (רץ…)") or a Date the Sheet made of it → Date, or null
function parseRunTime_(v) {
  if (v && typeof v.getTime === 'function') return isNaN(v.getTime()) ? null : new Date(v.getTime());
  const m = String(v || '').match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const back = Utilities.formatDate(new Date(guess), 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm').match(/(\d+)-(\d+)-(\d+) (\d+):(\d+)/);
  const offset = Date.UTC(+back[1], +back[2] - 1, +back[3], +back[4], +back[5]) - guess;   // Israel's offset from UTC at that moment
  return new Date(guess - offset);
}

/** {ok, problems:[{key, title, notes}]} — also used by the digest mail. */
function watchdogStatus_() {
  const problems = [];
  const fix = 'מה לעשות: לפתוח את Apps Script (פרויקט Job Feed) ולהריץ runFeed. אם יש שגיאה — לבדוק ב-Executions מה נכשל.';
  let row = [];
  try {
    const st = SpreadsheetApp.openById(SHEET_ID).getSheetByName('סטטוס');
    if (st && st.getLastRow() >= 2) row = st.getRange(2, 1, 1, 5).getValues()[0];
  } catch (e) { problems.push({ key: 'sheet', title: '⚠️ Job Feed: אין גישה לגיליון', notes: String(e && e.message || e) + '\n\n' + fix }); }
  const last = parseRunTime_(row[0]);
  const hours = last ? Math.floor((Date.now() - last.getTime()) / 36e5) : null;
  if (!last) problems.push({ key: 'stale', title: '⚠️ Job Feed: אין ריצה מתועדת', notes: 'בלשונית סטטוס אין זמן ריצה אחרונה.\n\n' + fix });
  else if (hours >= WATCHDOG_HOURS) problems.push({ key: 'stale', title: '⚠️ Job Feed לא רץ ' + hours + ' שעות', notes: 'ריצה אחרונה: ' + row[0] + '\n\n' + fix });
  const err = String(row[4] == null ? '' : row[4]).trim();
  if (err) problems.push({ key: 'error', title: '⚠️ Job Feed: שגיאה', notes: 'השגיאה: ' + err.slice(0, 500) + '\n\n' + fix });
  if (!ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === 'runFeed'))
    problems.push({ key: 'trigger', title: '⚠️ Job Feed: אין טריגר שעתי', notes: 'הריצה האוטומטית של runFeed לא מוגדרת.\n\nמה לעשות: לפתוח את Apps Script ולהריץ setup (יוצר מחדש את הטריגר ומריץ את runFeed).' });
  return { ok: !problems.length, problems };
}

/** Every 3 hours: one phone alert per problem per day at most. */
function watchdog() {
  const s = watchdogStatus_();
  const day = Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd');
  s.problems.forEach((p) => { try { notify_(p.title, p.notes, 'watchdog_' + p.key + '_' + day); } catch (e) { console.warn('watchdog alert failed', e); } });
  return s;
}

/** A copy of the Sheet into Drive at most once every 7 days; keeps the 8 newest. Never throws. */
function backupSheet_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const lastAt = Number(props.getProperty('backup_last') || 0);
    if (Date.now() - lastAt < BACKUP_DAYS * 864e5) return false;
    const folder = ownFolder_('backup_folder_id', BACKUP_FOLDER);   // Shared.gs: pinned by id, owned by me
    DriveApp.getFileById(SHEET_ID).makeCopy(BACKUP_PREFIX + Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd'), folder);
    props.setProperty('backup_last', String(Date.now()));
    const files = [];
    const fi = folder.getFiles();
    while (fi.hasNext()) { const f = fi.next(); if (f.getName().indexOf(BACKUP_PREFIX) === 0) files.push(f); }
    files.sort((a, b) => b.getDateCreated() - a.getDateCreated());
    files.slice(BACKUP_KEEP).forEach((f) => f.setTrashed(true));   // only old backups, only in this folder
    return true;
  } catch (e) { console.warn('backup failed', e); return false; }
}
