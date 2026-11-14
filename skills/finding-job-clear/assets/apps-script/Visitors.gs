/**
 * Visitors.gs — phone alerts when someone downloads the CV or clicks WhatsApp/mail on the site, and numbers for the digest.
 * Reads GET /api/feed/activity on the site with its own FEED_TOKEN (the Worker knows it as FEED_TOKEN), header only,
 * never in the URL. It is a separate token from API_TOKEN, so it can only read site activity, nothing else. Without
 * FEED_TOKEN a key derived from API_TOKEN is sent (hex HMAC-SHA256 over "feed", the same in the Worker), never the
 * token itself.
 * Nothing here throws: a failed fetch just waits for the next hourly run.
 */
const FEED_SITE = '{{SITE_URL}}';
const ALERTS_PER_RUN = 3;   // more site alerts than this in one run → one combined alert (so nobody can flood the phone)

/** The site's activity since a moment (epoch ms), or null on any failure. */
function fetchActivity_(sinceMs) {
  try {
    const props = PropertiesService.getScriptProperties();
    const api = String(props.getProperty('API_TOKEN') || '').trim();
    const token = String(props.getProperty('FEED_TOKEN') || '').trim() || (api ? hmacHex_(api, 'feed') : '');   // Push.gs: hmacHex_
    if (!token) { console.warn('visitors: no FEED_TOKEN'); return null; }
    const r = UrlFetchApp.fetch(FEED_SITE + '/api/feed/activity?since=' + Math.floor(Number(sinceMs) || 0), { headers: { 'X-Feed-Token': token }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) { console.warn('visitors: feed ' + r.getResponseCode()); return null; }
    const j = JSON.parse(r.getContentText());
    return j && Array.isArray(j.cv) ? j : null;
  } catch (e) { console.warn('visitors: fetch failed', e); return null; }
}

const visitTime_ = (at) => Utilities.formatDate(new Date(at), 'Asia/Jerusalem', 'dd.MM HH:mm');
const cvLine_ = (c) => visitTime_(c.at) + ' · ' + (c.which === 'en' ? 'אנגלית' : 'עברית') + ' · הגיע מ: ' + c.ref + ' · ' + c.country + ' · ' + c.device;

/** Hourly (from runFeed): one alert per new CV download (grouped when there are many) and per contact click. */
function siteActivity_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const since = Number(props.getProperty('site_since')) || Date.now() - 864e5;
    const a = fetchActivity_(since);
    if (!a) return null;
    const link = '\nהדשבורד: ' + DASHBOARD + '#visitors';
    const cv = a.cv || [], contacts = a.contacts || [];
    const contactLine_ = (c) => visitTime_(c.at) + ' · ' + (c.what === 'whatsapp' ? 'וואטסאפ' : 'מייל');
    if (cv.length + contacts.length > ALERTS_PER_RUN) {
      // many at once: one alert with everything, instead of a burst of popups
      const lines = cv.map((c) => '📄 ' + cvLine_(c)).concat(contacts.map((c) => '💬 ' + contactLine_(c)));
      const all = cv.concat(contacts).map((x) => Number(x.at) || 0);
      notify_('📄 ' + cv.length + ' הורדות קורות חיים · 💬 ' + contacts.length + ' לחיצות קשר באתר', lines.join('\n') + link, 'site_' + Math.min(...all) + '_' + Math.max(...all));
    } else {
      cv.forEach((c) => notify_('📄 מישהו הוריד את קורות החיים (' + (c.which === 'he' ? 'עברית' : 'אנגלית') + ')',
        'מתי: ' + visitTime_(c.at) + '\nהגיע מ: ' + c.ref + '\nמדינה: ' + c.country + '\nמכשיר: ' + c.device + link, 'cv_' + c.at));
      contacts.forEach((c) => notify_('💬 מישהו לחץ על וואטסאפ/מייל באתר',
        'מתי: ' + visitTime_(c.at) + '\nמה: ' + (c.what === 'whatsapp' ? 'וואטסאפ' : 'מייל') + link, 'contact_' + c.at + '_' + c.what));
    }
    const last = Math.max(since, Number(a.until) || 0, ...cv.concat(contacts, a.questions || []).map((x) => Number(x.at) || 0));
    props.setProperty('site_since', String(last));
    return { cv: cv.length, contacts: contacts.length };
  } catch (e) { console.warn('visitors: alerts failed', e); return null; }
}

/** For the digest: what happened on the site since a moment. Zeros when the site can't be reached. */
function visitorsForDigest_(sinceMs) {
  const empty = { visits: 0, cv: 0, contacts: 0, questions: [] };
  try {
    const a = fetchActivity_(sinceMs);
    if (!a) return empty;
    return { visits: Number(a.visits) || 0, cv: (a.cv || []).length, contacts: (a.contacts || []).length, questions: (a.questions || []).map((q) => String(q.q || '')).filter(Boolean).slice(0, 20) };
  } catch (e) { console.warn('visitors: digest failed', e); return empty; }
}

/** Run once after pasting all the files: makes every trigger, runs everything once, and logs what is ready and what is missing. */
function setupAll() {
  const has = (fn) => ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === fn);
  const log = [];
  if (!has('runFeed')) { ScriptApp.newTrigger('runFeed').timeBased().everyHours(1).create(); log.push('✅ נוצרה ריצה כל שעה'); } else log.push('✅ ריצה כל שעה קיימת');
  setupDigest(); log.push('✅ סיכום יומי ב-' + DIGEST_HOUR + ':00 (מייל, ועם הגדרת טלגרם גם טלגרם)');   // always remade: replaces the old Sun/Tue/Thu triggers
  if (typeof morningBrief === 'function' && !has('morningBrief')) { ScriptApp.newTrigger('morningBrief').timeBased().everyDays(1).atHour(TG_MORNING_HOUR).nearMinute(0).inTimezone('Asia/Jerusalem').create(); }
  if (typeof morningBrief === 'function') log.push('✅ עדכון בוקר כל יום ב-0' + TG_MORNING_HOUR + ':00 (טלגרם)');
  try { setupWatchdog(); log.push('✅ השומר פעיל (כל 3 שעות)'); } catch (e) { log.push('❌ השומר: ' + e.message); }
  try { runFeed(); log.push('✅ runFeed רץ'); } catch (e) { log.push('❌ runFeed: ' + e.message); }
  if (typeof pushActive_ === 'function') log.push(pushActive_() ? '✅ האתר וניקה מקבלים את הנתונים מיד בסוף כל ריצה' : '❌ העדכון המיידי לאתר נכשל: כדאי לבדוק ש-API_TOKEN זהה ל-APPS_SCRIPT_TOKEN באתר');
  const props = PropertiesService.getScriptProperties();
  log.push(props.getProperty('GEMINI_KEY') ? '✅ יש GEMINI_KEY' : '❌ חסר GEMINI_KEY בהגדרות הפרויקט ← מאפייני סקריפט');
  log.push(props.getProperty('API_TOKEN') ? '✅ יש API_TOKEN (הדשבורד)' : '❌ חסר API_TOKEN');
  log.push(props.getProperty('TELEGRAM_BOT_TOKEN') && props.getProperty('TELEGRAM_CHAT_ID') ? '✅ יש TELEGRAM_BOT_TOKEN ו-TELEGRAM_CHAT_ID (טלגרם)' : '❌ חסרים TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID בהגדרות הפרויקט ← מאפייני סקריפט (בלי זה אין טלגרם)');
  log.push(props.getProperty('FEED_TOKEN') ? '✅ יש FEED_TOKEN (התראות מהאתר)' : '❌ חסר FEED_TOKEN בהגדרות הפרויקט ← מאפייני סקריפט');
  try { log.push(taskListId_() ? '✅ רשימת המשימות "' + TASK_LIST + '" נמצאה' : '❌ לא נמצאה רשימה בשם "' + TASK_LIST + '"'); }
  catch (e) { log.push('❌ Google Tasks API לא נוסף תחת "שירותים"'); }
  console.log(log.join('\n'));
  return log;
}
