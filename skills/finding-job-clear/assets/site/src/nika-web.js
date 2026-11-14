// Nika in the dashboard: the same assistant as on Telegram (src/nika.js), the same conversation core (converse),
// the same shared history and the same approvals (decide). Only the channel differs: the signed-in chat panel
// (public/js/app-8.js) instead of the Telegram webhook. The Worker checks the session and the origin before this runs.
//   GET  /api/private/nika          → the shared conversation so far (Telegram and the dashboard together)
//   POST /api/private/nika          { text, notes? } → { reply, proposals: [{ id, type, label, fields }] }
//   POST /api/private/nika/decide   { id, ok, edits? } → runs (or cancels) a proposal, once
import { converse, decide, snapshot, statusText, nikaBot, jobData, HELP, ilTime, MODEL_DOWN, describe, readCapped } from './nika.js';

const PROPOSAL_ID = /^[a-f0-9]{16}$/;
const out = (body, status = 200) => ({ body, status });
async function readBody(req, max) {
  const t = await readCapped(req, max * 4);   // refused before it is read in full
  if (t.length > max) throw new Error('too_large');
  const j = JSON.parse(t || '{}');
  return j && typeof j === 'object' ? j : {};
}
// what the dashboard shows on a proposal card: plain strings only (the page puts them in with textContent).
// title: written in code from the action itself (nika.js describe), the same text the Telegram approval shows
function view(p, s) {
  const { type, label, ...rest } = p.action;
  const fields = {};
  for (const [k, v] of Object.entries(rest)) if (v != null && typeof v !== 'object') fields[k] = String(v).slice(0, 4000);
  return { id: p.id, type, label: String(label || type).slice(0, 80), title: describe(p.action, s).title, fields };
}
// the dashboard's saved notes ("remember that…"), sent with each message from the dashboard only
const notesLine = (notes) => {
  const list = (Array.isArray(notes) ? notes : []).map((n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 200)).filter(Boolean).slice(0, 20);
  return list.length ? `(העדפות ש{{FIRST_NAME_HE}} שמר בדשבורד: ${list.join('; ')})` : '';
};

export async function nikaWeb(req, env, ctx, d, path) {
  const b = nikaBot(env);
  if (path === '/api/private/nika' && req.method === 'GET') return out({ ok: true, history: await b.history() });
  if (req.method !== 'POST') return out({ ok: false, error: 'not_found' }, 404);
  let body; try { body = await readBody(req, 12000); } catch { return out({ ok: false, error: 'bad_request' }, 400); }

  if (path === '/api/private/nika/decide') {
    const id = String(body.id || '');
    if (!PROPOSAL_ID.test(id)) return out({ ok: false, error: 'bad_id' }, 400);
    const r = await decide(env, ctx, d, id, body.ok === true, body.edits);
    return out({ ok: true, status: r.status, message: r.message || r.toast, url: r.url || '' });
  }
  if (path !== '/api/private/nika') return out({ ok: false, error: 'not_found' }, 404);

  const text = String(body.text || '').trim().slice(0, 2000);
  if (!text) return out({ ok: false, error: 'empty' }, 400);
  const say = (reply, extra = {}) => out({ ok: true, reply, proposals: [], ...extra });
  // the same commands as on Telegram
  if (/^\/(start|help)\b/.test(text)) return say(HELP);
  if (/^\/new\b/.test(text)) { await b.forget(); return say('התחלנו שיחה חדשה ✨'); }
  if (/^\/reminders\b/.test(text)) {
    const up = await b.upcoming(Date.now());
    return say(up.length ? '*⏰ התזכורות הקרובות*\n' + up.map((r) => `• ${ilTime(new Date(r.due))} · ${r.text}`).join('\n') : 'אין תזכורות פתוחות.');
  }
  const t0 = Date.now();
  let s;
  try { s = snapshot(await jobData(env, ctx, d, b)); } catch { return say('לא הצלחתי לקרוא את נתוני החיפוש כרגע 😕 אפשר לנסות שוב בעוד דקה.', { failed: true }); }
  if (/^\/status\b/.test(text)) return say(statusText(s));
  const r = await converse(env, ctx, d, s, text, { channel: 'web', note: notesLine(body.notes), t0, tData: Date.now() });
  if (!r) return say(MODEL_DOWN, { failed: true });
  return out({ ok: true, reply: r.reply, proposals: r.proposals.map((p) => view(p, s)) });
}
