// Push-on-change. Apps Script calls POST /api/push at the end of every hourly run (apps-script/Push.gs), with its
// push key (derived from the shared token, see pushRoute) in a header. The Worker answers at once, then reads the fresh data, keeps it for Nika and the dashboard,
// and Nika announces what is new on Telegram from fixed texts (no model call at all).
//
// What counts as new is decided against the keys already announced (kept in Nika's Durable Object), not only against
// the previous copy, because that copy is also refreshed by Nika and the cron while the hourly run is still writing.
// Every fresh read of the data (the push, the 5-minute cron, Nika, the dashboard) runs the same check, so an alert is
// never lost when one push fails, and never sent twice.
//
// Who announces what on Telegram (one owner for each kind of event):
//  - here (Nika): a positive answer (interview invite, assignment, offer), a rejection, a new interview date,
//    a new strong lead. Only rows the hourly script made from a mail ("mail-…"), never the owner's own updates.
//  - Apps Script: site activity (CV downloads, contact clicks), the watchdog, the morning / evening / weekly messages.
//    Its calendar popups for the same mails stay (they are not Telegram). See apps-script/Push.gs.
import { nikaBot, say, keepData, BLOCKED } from './nika.js';
import { CODE_VERSION, UPSTREAM_VERSION_URL, newer, mismatchText, upstreamText } from './version.js';

const STRONG = 75;        // = LEADS_STRONG in Leads.gs: "מתאים מאוד" with this score or more
const RECENT_DAYS = 3;    // only rows from the last days count as news (a re-import never floods the chat)
const MAX_LEADS = 5;

const ilDate = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(d);
const whenText = (at, timed) => new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', weekday: 'long', day: '2-digit', month: '2-digit', ...(timed ? { hour: '2-digit', minute: '2-digit' } : {}) }).format(new Date(at));
const slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9֐-׿]+/g, '-').replace(/^-+|-+$/g, '');
const roleOf = (r) => (/^לא צוין/.test(String(r || '').trim()) ? '' : String(r || '').trim());
const who = (company, role) => String(company || '').trim() + (role ? ` (${role})` : '');

// the fixed texts
const TEMPLATES = {
  head: '🔔 *חדש בחיפוש העבודה*',
  ראיון: { icon: '🎤', title: 'הזמנה לראיון' },
  הצעה: { icon: '🎉', title: 'הצעת עבודה' },
  התקדמות: { icon: '📝', title: 'מטלה' },
  date: '📅 *מועד לראיון:*',
  dateUnder: '   📅 המועד:',
  rejected: '❌ *דחייה:*',
  leads: '🎯 *משרות חדשות שכדאי להגיש:*',
  moreLeads: (n) => `ועוד ${n} בדשבורד`,
  answerSoon: 'כדאי לענות להם בהקדם 💪',
  dashboard: (origin) => `הכול בדשבורד: ${origin}/app`,
};

/** What in the data deserves an alert: [{key, group, ...}], one per key. Pure (no I/O), so it is easy to test. */
export function alertsFrom(data, now = Date.now()) {
  const since = ilDate(new Date(now - RECENT_DAYS * 864e5));
  const ok = (x) => !BLOCKED.test(JSON.stringify(x));
  const out = new Map();
  const add = (item) => { if (!out.has(item.key)) out.set(item.key, item); };
  // answers from companies: rows the hourly script made from an incoming mail
  (data.events || []).filter(ok).filter((e) => /^mail-/.test(String(e.id)) && String(e.date).slice(0, 10) >= since).forEach((e) => {
    const role = roleOf(e.role), same = slug(e.company) + '|' + (role ? slug(role) : String(e.thread_id || e.id));
    if (e.kind === 'דחייה') add({ key: 'rej:' + same, group: 'rejected', company: e.company, role });
    else if (TEMPLATES[e.kind] && /^true$/i.test(String(e.action))) add({ key: 'pos:' + e.kind + ':' + same, group: 'positive', kind: e.kind, company: e.company, role });
  });
  // interview dates found in the mails (Apps Script sends them with the data)
  (data.interviews || []).filter(ok).filter((i) => Number(i.at) > now).forEach((i) => {
    add({ key: 'date:' + i.key + ':' + i.at, group: 'date', company: i.company, role: roleOf(i.role), at: Number(i.at), timed: i.timed !== false });
  });
  // new strong leads: the score is kept at the start of `why` ("85 · …")
  (data.job_leads || []).filter(ok).filter((l) => l.fit === 'מתאים מאוד' && !/הוגש|לא רלוונטי/.test(String(l.status || '')) && String(l.seen).slice(0, 10) >= since).forEach((l) => {
    const m = String(l.why || '').match(/^(\d{1,3})\s*·/), score = m ? Number(m[1]) : 0;
    if (score >= STRONG) add({ key: 'lead:' + l.id, group: 'lead', company: l.company, role: l.role, score });
  });
  return [...out.values()];
}

/** One Telegram message for everything new (Nika's *bold* style; say() turns it into safe HTML). */
export function messageFor(items, origin = '') {
  const lines = [TEMPLATES.head, ''];
  const pos = items.filter((i) => i.group === 'positive');
  let dates = items.filter((i) => i.group === 'date');
  const gap = () => { if (lines.length > 2) lines.push(''); };   // a blank line between items: easy to read on a phone
  pos.forEach((i) => {
    const t = TEMPLATES[i.kind];
    gap();
    lines.push(`${t.icon} *${t.title}:* ${who(i.company, i.role)}`);
    // the interview's date under the invite itself, when it came in the same mail
    const d = i.kind === 'ראיון' && dates.find((x) => slug(x.company) === slug(i.company));
    if (d) { lines.push(`${TEMPLATES.dateUnder} ${whenText(d.at, d.timed)}`); dates = dates.filter((x) => x !== d); }
  });
  dates.forEach((d) => { gap(); lines.push(`${TEMPLATES.date} ${who(d.company, d.role)} · ${whenText(d.at, d.timed)}`); });
  items.filter((i) => i.group === 'rejected').forEach((i) => { gap(); lines.push(`${TEMPLATES.rejected} ${who(i.company, i.role)}`); });
  const leads = items.filter((i) => i.group === 'lead').sort((a, b) => b.score - a.score);
  if (leads.length) {
    if (lines.length > 2) lines.push('');
    lines.push(TEMPLATES.leads);
    leads.slice(0, MAX_LEADS).forEach((l) => lines.push(`• ${l.company} · ${l.role} · ${l.score}`));
    if (leads.length > MAX_LEADS) lines.push(TEMPLATES.moreLeads(leads.length - MAX_LEADS));
  }
  if (pos.length) lines.push('', TEMPLATES.answerSoon);
  if (origin) lines.push('', TEMPLATES.dashboard(origin));
  return lines.join('\n');
}

/** Sends one grouped message with what was never announced before. Returns how many items went out. */
export async function pushAlerts(env, data) {
  if (!env.BOT || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return 0;
  const items = alertsFrom(data);
  const b = nikaBot(env);
  const fresh = new Set(await b.claimAlerts(items.map((i) => i.key)));
  const send = items.filter((i) => fresh.has(i.key));
  if (!send.length) return 0;
  const r = await say(env, messageFor(send, await b.origin()));
  if (!r || !r.ok) { await b.unclaimAlerts(send.map((i) => i.key)); return 0; }   // try again with the next fresh read
  return send.length;
}

/** A short hash of the tables the dashboard shows: the same data → the same version. */
export async function dataVersion(d) {
  const body = JSON.stringify(['applications', 'events', 'prep', 'job_leads', 'mails', 'jobs'].map((k) => d[k] || []));
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
  return [...new Uint8Array(h)].slice(0, 8).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** After every fresh read from Apps Script: the version for open dashboards, then the alerts. */
export async function afterFresh(env, data) {
  if (!env.BOT) return;
  if (data.ver) await nikaBot(env).setVersion(data.ver);
  await pushAlerts(env, data);
  await versionAlert(env, data);
  await interviewCheckins(env, data);
}

/**
 * "How did it go?" a few hours after an interview (fixed text, no model). The question goes into Nika's conversation,
 * so the answer reaches her with its context and she can propose the update or a follow-up draft. Once per interview,
 * only 09:00–21:00 Israel time. An interview with a known time: from 3 hours after it; a date with no time: from the
 * evening of that day (10 hours after the morning alert hour). Interviews older than a day are skipped.
 */
export function checkinsDue(data, now = Date.now()) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hourCycle: 'h23' }).format(new Date(now)));
  if (hour < 9 || hour >= 21) return [];
  return (data.interviews || []).filter((i) => i && i.at && !BLOCKED.test(String(i.company || '')))
    .filter((i) => { const ago = now - Number(i.at); return ago >= (i.timed ? 3 : 10) * 3600e3 && ago <= 24 * 3600e3; });
}
export const checkinText = (i) => `👋 איך היה הראיון ב-*${String(i.company).trim()}*${i.role ? ` (${i.role})` : ''}?\n\nכמה מילים על זה: מה שאלו, איך זה הרגיש, ומה השלב הבא.\nאני ארשום את זה, ואם צריך, אכין פולואפ.`;
export async function interviewCheckins(env, data, now = Date.now()) {
  if (!env.BOT || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return 0;
  const due = checkinsDue(data, now);
  if (!due.length) return 0;
  const b = nikaBot(env);
  const fresh = new Set(await b.claimAlerts(due.map((i) => 'howwas:' + (i.key || i.company + '|' + i.at))));
  let n = 0;
  for (const i of due) {
    const key = 'howwas:' + (i.key || i.company + '|' + i.at);
    if (!fresh.has(key)) continue;
    const text = checkinText(i);
    const r = await say(env, text);
    if (!r || !r.ok) { await b.unclaimAlerts([key]); continue; }
    await b.remember('assistant', text.replace(/\*/g, ''));
    n++;
  }
  return n;
}

/** The site and Apps Script must run the same code version; when they don't, Nika says which side is behind, once per pair. */
export async function versionAlert(env, data) {
  if (!env.BOT || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID || !data || !data.ok) return false;
  const gs = String(data.code_version || '');
  if (gs === CODE_VERSION) return false;
  const b = nikaBot(env), key = 'ver:' + CODE_VERSION + ':' + (gs || 'none');
  if (!(await b.claimAlerts([key])).length) return false;
  const r = await say(env, mismatchText(CODE_VERSION, gs));
  if (!r || !r.ok) { await b.unclaimAlerts([key]); return false; }
  return true;
}

/** Once a day (the cron): a newer public template → Nika says so once. Only a site built from the template checks. */
export async function upstreamCheck(env) {
  if (!UPSTREAM_VERSION_URL || !env.BOT || !env.TELEGRAM_BOT_TOKEN) return false;
  try {
    const r = await fetch(UPSTREAM_VERSION_URL, { cf: { cacheTtl: 3600 } });
    if (!r.ok) return false;
    const latest = (await r.text()).trim().slice(0, 20);
    if (!/^[0-9.-]+$/.test(latest) || !newer(latest, CODE_VERSION)) return false;
    const b = nikaBot(env), key = 'upstream:' + latest;
    if (!(await b.claimAlerts([key])).length) return false;
    const s = await say(env, upstreamText(CODE_VERSION, latest));
    if (!s || !s.ok) { await b.unclaimAlerts([key]); return false; }
    return true;
  } catch (e) { console.error('upstream check', String(e.message || e)); return false; }
}

/**
 * POST /api/push — only Apps Script, with its push key in X-Push-Token, compared in constant time. The key is NOT the
 * data API token: it is derived from it (hex HMAC-SHA256, key = APPS_SCRIPT_TOKEN, message "push"; Push.gs does the
 * same with API_TOKEN), so no extra secret is needed and a push key that leaks can't read or change any data.
 * When PUSH_TOKEN is set on both sides (the Worker secret and the Script Property), that value is used instead.
 * The answer comes at once; the fresh read, the saved copies and the alerts follow in the background.
 */
export async function pushRoute(req, env, ctx, d) {
  if (await d.limited(req, env, 'push', 30, 600)) return d.bad('rate_limited', 429);
  const api = String(env.APPS_SCRIPT_TOKEN || '').trim();
  const token = String(env.PUSH_TOKEN || '').trim() || (api ? await d.hmac(api, 'push') : '');
  if (!token || !env.APPS_SCRIPT_URL || !d.safeEqual((req.headers.get('X-Push-Token') || '').trim(), token)) return d.bad('unauthorized', 401);
  const origin = new URL(req.url).origin;
  ctx.waitUntil((async () => {
    if (env.BOT) await nikaBot(env).noteOrigin(origin);
    await d.invalidateData();
    const data = await d.appsData(env, ctx, true);   // → afterFresh: the version and the alerts
    await keepData(env, data);                        // Nika answers from the new data at once
  })().catch((e) => console.error('push', String(e.message || e))));
  return d.json({ ok: true }, 202);
}
