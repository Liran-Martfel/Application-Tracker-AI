/**
 * Telegram.gs — alerts and daily summaries to your own Telegram chat, through Nika's bot (the eighth file in "Job Feed").
 * Setup once: Project Settings → Script Properties → TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID (from @BotFather and
 * getUpdates, see the guide; you type them yourself), then run setupTelegram.
 * Without the two properties nothing is sent and nothing breaks: the email and calendar alerts keep working.
 * Only sends to that one chat (it never reads messages, so it does not disturb Nika's own bot loop).
 */
const TG_MORNING_HOUR = 8;    // what's on today
const TG_EVENING_HOUR = 18;   // the day's summary (sendDigest, with the email)
let tgLastSend_ = 0;

/** Sends one message to your Telegram chat. *bold* becomes bold. Returns true when Telegram accepted it. */
function tgSend_(text) {
  const props = PropertiesService.getScriptProperties();
  // tolerant of how the values were pasted: quotes, spaces, a "bot" prefix or the whole line from vault.py
  const token = (String(props.getProperty('TELEGRAM_BOT_TOKEN') || '').match(/\d{6,}:[A-Za-z0-9_-]{30,}/) || [''])[0];
  const chat = (String(props.getProperty('TELEGRAM_CHAT_ID') || '').match(/-?\d+/) || [''])[0];
  if (!token || !chat) { console.warn('Telegram: ' + (!token ? 'TELEGRAM_BOT_TOKEN is missing or not a bot token' : 'TELEGRAM_CHAT_ID is missing or not a number')); return false; }
  const plain = STRIP_PHONES(String(text || '')).slice(0, 3500);
  if (!plain.trim()) return false;
  const html = plain.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace(/\*([^*\n]+)\*/g, '<b>$1</b>');
  const wait = tgLastSend_ + 1100 - Date.now();   // Telegram: about one message a second to one chat
  if (wait > 0) Utilities.sleep(wait);
  let r;
  try {
    r = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      payload: JSON.stringify({ chat_id: chat, text: html, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) { console.warn('Telegram: no connection', e); return false; }
  tgLastSend_ = Date.now();
  let ok = false;
  try { ok = r.getResponseCode() === 200 && JSON.parse(r.getContentText()).ok === true; } catch (e) {}
  if (!ok) console.warn('Telegram: not sent (' + r.getResponseCode() + '): ' + r.getContentText().slice(0, 200));   // never logs the token
  return ok;
}

const tgDay_ = (d) => Utilities.formatDate(d, 'Asia/Jerusalem', 'yyyy-MM-dd');
const tgShort_ = (s) => String(s || '').slice(8, 10) + '.' + String(s || '').slice(5, 7);

/** 08:00 — what's on today: interviews and deadlines, replies you owe, follow-ups, tasks, jobs worth applying to. */
function morningBrief() {
  try { runFeed(); } catch (e) { console.warn('feed before the morning brief failed', e); }
  const now = new Date(), today = tgDay_(now);
  const lines = [];

  // today's calendar: job events first (interviews, assignments, deadlines), then the rest of the day.
  // Alerts the feed already sent (📬, 📄, 💬) are left out; so is anything about a blocked company.
  try {
    const at = (e) => (e.isAllDayEvent() ? '' : Utilities.formatDate(e.getStartTime(), 'Asia/Jerusalem', 'HH:mm') + ' ');
    const all = CalendarApp.getDefaultCalendar().getEventsForDay(now).filter((e) => !BLOCKED.test(e.getTitle()) && !/^[📬📄💬⚠️]/u.test(e.getTitle()));
    const job = all.filter((e) => /ראיון|interview|מטלה|assignment|הצעה|offer|⏳/i.test(e.getTitle()));
    const rest = all.filter((e) => job.indexOf(e) < 0);
    if (job.length) {
      lines.push('*📅 היום בחיפוש העבודה*');
      job.slice(0, 6).forEach((e) => lines.push('• ' + at(e) + e.getTitle().replace(/^[⏳🔔]\s*/u, '')));
    }
    if (rest.length) {
      if (lines.length) lines.push('');
      lines.push('*🗓️ עוד ביומן*');
      rest.slice(0, 8).forEach((e) => lines.push('• ' + at(e) + e.getTitle()));
    }
  } catch (e) { console.warn('morning: calendar', e); }

  // the same picture as the dashboard and Nika (jobState_ in Shared.gs): what still waits for you, and follow-ups
  // that are due and have a direct email to write to (no direct email → nothing to follow up, you wait for them)
  const js = jobState_(today);
  if (js.waiting.length) {
    lines.push('', '*🔔 מחכה לתגובה שלך*');
    js.waiting.slice(0, 5).forEach((e) => lines.push('• ' + e.company + ' · ' + e.kind + ' · ' + tgShort_(e.date)));
  }
  if (js.followDue.length) {
    lines.push('', '*⏰ פולואפ שהגיע זמנו*');
    js.followDue.slice(0, 5).forEach((a) => lines.push('• ' + a.company + ' · ' + a.role + ' · ' + a.direct_contact));
  }

  // open tasks in your job-search list that are due by today
  try {
    if (typeof Tasks !== 'undefined') {
      const list = taskListId_();
      const items = list ? ((Tasks.Tasks.list(list, { showCompleted: false, maxResults: 50 }) || {}).items || []) : [];
      const due = items.filter((t) => t.due && String(t.due).slice(0, 10) <= today);
      if (due.length) { lines.push('', '*✅ משימות להיום*'); due.slice(0, 6).forEach((t) => lines.push('• ' + t.title)); }
    }
  } catch (e) { console.warn('morning: tasks', e); }

  // jobs Gemini scored high since yesterday; while the push works Nika already sent each one (Push.gs), so not again
  let strong = [];
  try { strong = leadsForDigest_(tgDay_(new Date(now.getTime() - 864e5))); } catch (e) { console.warn('morning: leads', e); }
  if (strong.length && !(typeof pushActive_ === 'function' && pushActive_())) {
    lines.push('', '*🎯 משרות שכדאי להגיש*');
    strong.slice(0, 4).forEach((l) => lines.push('• ' + l.company + ' · ' + l.role));
  }

  const weather = tgWeather_();
  const head = '☀️ *בוקר טוב! מה יש היום* · ' + tgShort_(today) + (weather ? '\n🌤️ ' + weather : '');
  const msg = lines.length ? [head, '', ...lines, '', DASHBOARD].join('\n') : head + '\n\nאין היום ראיונות, משימות או תגובות שמחכות לך. יום טוב 🙂';
  return tgSend_(msg);
}

// today's weather in one short line (wttr.in, free, no key); empty when it does not answer
const TG_WEATHER_CITY = '{{WEATHER_CITY_EN}}';
function tgWeather_() {
  try {
    const r = UrlFetchApp.fetch('https://wttr.in/' + encodeURIComponent(profileGet_('עיר למזג אוויר') || TG_WEATHER_CITY) + '?format=' + encodeURIComponent('%C %t') + '&lang=he&m', { muteHttpExceptions: true });
    const t = r.getResponseCode() === 200 ? r.getContentText().trim() : '';
    return t && t.length < 60 && !/unknown|error|</i.test(t) ? t.replace(/\+(\d)/, '$1') : '';
  } catch (e) { return ''; }
}

/** Friday 12:00 — the week in the job search: applications sent, replies by kind, new jobs, site visits. */
function weeklySummary() {
  const now = new Date(), since = tgDay_(new Date(now.getTime() - 7 * 864e5));
  const mails = tgRows_('מיילים').filter((m) => m.date.slice(0, 10) >= since && !BLOCKED.test(m.company + ' ' + m.subject));
  const sent = new Set(mails.filter((m) => m.direction === 'יוצא').map((m) => String(m.company || m.from_domain).toLowerCase())).size;
  const inc = mails.filter((m) => m.direction === 'נכנס');
  const n = (k) => inc.filter((m) => m.kind === k).length;
  const jobs = tgRows_('משרות').filter((j) => String(j.seen) >= since && j.fit === 'מתאים מאוד').length;
  let site = { visits: 0, cv: 0, contacts: 0 };
  try { site = visitorsForDigest_(now.getTime() - 7 * 864e5); } catch (e) { console.warn('weekly: site', e); }
  const lines = ['📊 *השבוע בחיפוש העבודה* · ' + tgShort_(since) + '–' + tgShort_(tgDay_(now)), '',
    '📤 הגשת ל-' + sent + ' חברות',
    '🎤 ' + n('ראיון') + ' ראיונות · 📝 ' + n('מטלה') + ' מטלות' + (n('הצעה') ? ' · 🎉 ' + n('הצעה') + ' הצעות' : ''),
    '📨 ' + n('אישור הגשה') + ' אישורי הגשה · ❌ ' + n('דחייה') + ' דחיות',
    '🆕 ' + jobs + ' משרות חדשות בתפקידי היעד'];
  if (site.visits || site.cv) lines.push('👀 באתר: ' + site.visits + ' ביקורים, ' + site.cv + ' הורדות קורות חיים');
  let insight = [];
  try { insight = weeklyInsight_(tgRows_('הגשות'), tgDay_(now)); } catch (e) { console.warn('weekly: insight', e); }
  if (insight.length) lines.push('', ...insight);
  lines.push('', sent >= 5 ? 'שבוע חזק 💪 ככה ממשיכים.' : 'שבוע הבא כדאי לכוון ל-5 הגשות לפחות. אני כאן אם צריך עזרה 🙂', '', DASHBOARD);
  return tgSend_(lines.join('\n'));
}

/**
 * "What works": which kinds of roles and which channels move forward, from the applications themselves (no Gemini).
 * Counts applications sent 60 to 7 days ago (newer ones had no time to get an answer). Moved forward = any status but
 * "הוגש" and "נדחה". Says something only when there is enough to compare (5+ applications, a group of 3+).
 */
const INSIGHT_ROLES = [
  ['Solutions / Integration', /solution|integration|architect|pre-?sales|implementation|אינטגרציה|פתרונות/i],
  ['AI / ML', /\b(ai|ml|llm|genai|machine learning|deep learning|data scien\w*|nlp|computer vision)\b|בינה מלאכותית|למידת מכונה/i],
  ['פיתוח תוכנה', /develop|engineer|programmer|python|backend|full.?stack|software|מפתח|פיתוח|מהנדס/i],
  ['דאטה ואנליזה', /analyst|analytics|\bbi\b|data|אנליסט|נתונים/i],
  ['מוצר', /product|מוצר/i]
];
function weeklyInsight_(apps, today) {
  const ago = (n) => { const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - n); return Utilities.formatDate(d, 'Asia/Jerusalem', 'yyyy-MM-dd'); };
  const from = ago(60), to = ago(7);
  const rows = (apps || []).filter((a) => a.applied && a.applied.slice(0, 10) >= from && a.applied.slice(0, 10) <= to && !BLOCKED.test(String(a.company || '')));
  if (rows.length < 5) return [];
  const moved = (a) => a.status && a.status !== 'הוגש' && a.status !== 'נדחה';
  const group = (keyOf) => {
    const g = {};
    rows.forEach((a) => { const k = keyOf(a); if (!k) return; g[k] = g[k] || { n: 0, up: 0 }; g[k].n++; if (moved(a)) g[k].up++; });
    return Object.keys(g).map((k) => ({ k: k, n: g[k].n, up: g[k].up, rate: g[k].up / g[k].n })).filter((x) => x.n >= 3);
  };
  const roleOf = (a) => { const t = String(a.role || ''); for (let i = 0; i < INSIGHT_ROLES.length; i++) if (INSIGHT_ROLES[i][1].test(t)) return INSIGHT_ROLES[i][0]; return 'אחר'; };
  const say = (x) => x.k + ': ' + x.up + ' מתוך ' + x.n + ' התקדמו';
  const out = [];
  const roles = group(roleOf).sort((a, b) => b.rate - a.rate || b.n - a.n);
  if (roles.length >= 2 && roles[0].rate > roles[roles.length - 1].rate) {
    out.push('💡 *מה עובד* (הגשות של החודשיים האחרונים)');
    out.push('• הכי טוב: ' + say(roles[0]));
    const low = roles[roles.length - 1];
    out.push('• הכי חלש: ' + say(low) + (low.up === 0 ? '. אולי כדאי להתאים את קורות החיים לסוג הזה, או להתמקד בראשון' : ''));
  }
  const chans = group((a) => String(a.channel || '').trim()).sort((a, b) => b.rate - a.rate || b.n - a.n);
  if (chans.length >= 2 && chans[0].rate > chans[chans.length - 1].rate) {
    if (!out.length) out.push('💡 *מה עובד* (הגשות של החודשיים האחרונים)');
    out.push('• הערוץ שהכי עובד: ' + say(chans[0]));
  }
  // does tailoring pay off? cv_version is filled when the tailored CV file is saved for that application (Api.gs save_cv)
  const cvs = group((a) => (String(a.cv_version || '').trim() ? 'קורות חיים מותאמים למשרה' : 'קורות חיים רגילים'))
    .sort((a, b) => b.rate - a.rate || b.n - a.n);
  if (cvs.length >= 2 && cvs[0].rate > cvs[cvs.length - 1].rate) {
    if (!out.length) out.push('💡 *מה עובד* (הגשות של החודשיים האחרונים)');
    out.push('• ' + say(cvs[0]) + ' · ' + say(cvs[cvs.length - 1]));
  }
  return out;
}

/** The evening Telegram message, sent by sendDigest with the email. counts = the numbers the digest already computed. */
function eveningSummary_(c) {
  const parts = [];
  if (c.waiting) parts.push('🔔 ' + c.waiting + ' מחכים לתגובה שלך');
  if (c.good) parts.push('✨ ' + c.good + ' עדכונים טובים');
  if (c.rejected) parts.push('❌ ' + c.rejected + ' דחיות');
  if (c.confirm) parts.push('📨 ' + c.confirm + ' אישורי הגשה');
  if (c.quiet) parts.push('⏰ ' + c.quiet + ' פולואפים שהגיע זמנם');
  if (c.newJobs) parts.push('🆕 ' + c.newJobs + ' משרות חדשות בתפקידי היעד');
  if (c.strong) parts.push('🎯 ' + c.strong + ' משרות שכדאי להגיש');
  if (c.cv || c.contacts) parts.push('👀 באתר: ' + c.cv + ' הורדות קורות חיים, ' + c.contacts + ' לחיצות קשר');
  const highlights = (c.highlights || []).slice(0, 4).map((h) => '• ' + h);
  const body = parts.length ? parts.join('\n') + (highlights.length ? '\n\n' + highlights.join('\n') : '') : 'יום שקט, בלי מיילים חדשים על ההגשות ובלי משרות חדשות.';
  return tgSend_('🌙 *סיכום היום* · ' + tgShort_(tgDay_(new Date())) + '\n\n' + body + '\n\nהפירוט המלא במייל ובדשבורד: ' + DASHBOARD);
}

function tgRows_(name) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);
  if (!sh || sh.getLastRow() < 2) return [];
  const fmt = (d) => Utilities.formatDate(d, 'Asia/Jerusalem', 'yyyy-MM-dd HH:mm');
  const [h, ...r] = sh.getDataRange().getValues();
  return r.map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] instanceof Date ? fmt(x[i]) : String(x[i] ?? '')])));
}

/** Run once after adding the two properties: daily triggers (08:00 morning, 18:00 summary) and a test message. */
function setupTelegram() {
  ScriptApp.getProjectTriggers().forEach((t) => { if (['morningBrief', 'sendDigest', 'weeklySummary'].includes(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('morningBrief').timeBased().everyDays(1).atHour(TG_MORNING_HOUR).nearMinute(0).inTimezone('Asia/Jerusalem').create();
  ScriptApp.newTrigger('sendDigest').timeBased().everyDays(1).atHour(TG_EVENING_HOUR).nearMinute(0).inTimezone('Asia/Jerusalem').create();
  ScriptApp.newTrigger('weeklySummary').timeBased().onWeekDay(ScriptApp.WeekDay.FRIDAY).atHour(12).nearMinute(0).inTimezone('Asia/Jerusalem').create();
  const sent = tgSend_('✅ *מעקב ההגשות מחובר לטלגרם.* מעכשיו: עדכון בוקר ב-0' + TG_MORNING_HOUR + ':00, סיכום יומי ב-' + TG_EVENING_HOUR + ':00, והתראות ברגע שמשהו קורה.');
  const log = ['✅ עדכון בוקר כל יום ב-0' + TG_MORNING_HOUR + ':00', '✅ סיכום יומי (מייל + טלגרם) כל יום ב-' + TG_EVENING_HOUR + ':00', '✅ סיכום שבועי בימי שישי ב-12:00',
    sent ? '✅ הודעת בדיקה נשלחה לטלגרם' : '❌ הודעת הבדיקה לא נשלחה: כדאי לבדוק את TELEGRAM_BOT_TOKEN ו-TELEGRAM_CHAT_ID במאפייני הסקריפט'];
  console.log(log.join('\n'));
  return log;
}
