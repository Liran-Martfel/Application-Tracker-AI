/* The site's stand-in for the Dashboard type's `dash` API: everything comes from one call to
   GET /api/private/data (the Worker proxies the Apps Script API), and writes go to /api/private/action. */
// links built from Sheet / Gmail data: only https and mailto, never javascript: or data:
window.safeHref = (u, fallback = '#') => (/^(https:|mailto:)/i.test(String(u || '').trim()) ? String(u).trim() : fallback);
window.SITE = (() => {
  async function api(path, opts) {
    const r = await fetch(path, { credentials: 'same-origin', ...opts });
    if (r.status === 401) { location.href = '/app'; throw new Error('unauthorized'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.ok === false) throw Object.assign(new Error(j.error || 'failed'), { code: j.error });
    return j;
  }
  const post = (path, body) => api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return {
    api,
    action: (payload) => post('/api/private/action', payload),
    // Gemini through the Worker. history: [{role:'user'|'assistant', text}]; json: ask for a JSON answer.
    gen: (prompt, opts = {}) => post('/api/private/gen', { prompt, system: opts.system || '', history: opts.history || [], json: !!opts.json }).then((j) => j.text || ''),
    ME: { name: '{{NAME_HE}}', name_en: '{{NAME_EN}}', email: '{{EMAIL}}' },
  };
})();

window.dash = (() => {
  const state = {};            // id -> {status, data, refreshing}
  const calcs = {}, listeners = [];
  let scheduled = false, raw = null, inflight = null;
  const notify = () => { if (scheduled) return; scheduled = true; queueMicrotask(() => { scheduled = false; recompute(); listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } }); stamp(); }); };
  function recompute() {
    for (const [id, c] of Object.entries(calcs)) {
      const ins = c.inputs.map((i) => state[i] || { status: 'loading' });
      if (ins.every((s) => s.status === 'ok')) {
        try { state[id] = { status: 'ok', data: c.fn(...ins.map((s) => s.data || [])) || [] }; } catch (e) { console.error(id, e); state[id] = { status: 'error', data: [] }; }
      } else if (ins.some((s) => s.status === 'error')) state[id] = { status: 'error', data: [] };
      else state[id] = { status: 'loading', data: [] };
    }
  }
  function stamp() {
    const el = document.querySelector('.jt-updated'); if (!el) return;
    el.textContent = raw?.at ? 'הנתונים עודכנו לאחרונה ' + new Date(raw.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }) : '';
  }
  // Sheets hands booleans back as TRUE/FALSE text in some rows
  const bool = (v) => (v === 'TRUE' || v === 'true') ? true : (v === 'FALSE' || v === 'false') ? false : v;
  const fix = (rows) => (Array.isArray(rows) ? rows : []).map((r) => Object.fromEntries(Object.entries(r || {}).map(([k, v]) => [k, bool(v)])));
  const SETS = ['applications', 'events', 'prep', 'job_leads', 'mails', 'jobs', 'goals', 'gmail_unread', 'gmail_sent'];
  function apply(d) {
    raw = d;
    ['applications', 'events', 'prep', 'job_leads', 'mails', 'jobs'].forEach((id) => { state[id] = { status: 'ok', data: fix(d[id]), refreshing: false }; });
    state.goals = { status: 'ok', data: [{ id: 'goal', weekly_goal: 5 }] };
    const live = d.live || {};
    const liveStatus = live.error ? 'error' : 'ok';
    state.gmail_unread = { status: liveStatus, refreshing: false, data: (live.unread || []).map((t) => ({ msg_id: '', thread_id: t, date: '', unread: true, sent: false, to: [] })) };
    state.gmail_sent = { status: liveStatus, refreshing: false, data: (live.sent || []).map((m) => ({ msg_id: '', thread_id: m.thread_id, date: m.date || '', unread: false, sent: true, to: m.to || [] })) };
    notify();
  }
  function load(fresh) {
    if (inflight) return inflight;
    SETS.forEach((id) => { if (state[id]?.status === 'ok') state[id] = { ...state[id], refreshing: true }; else state[id] = { status: 'loading', data: [] }; });
    notify();
    inflight = window.SITE.api('/api/private/data' + (fresh ? '?fresh=1' : ''))
      .then(apply)
      .catch((e) => { console.error('data', e); SETS.forEach((id) => { state[id] = state[id]?.data?.length ? { ...state[id], refreshing: false } : { status: 'error', data: [] }; }); notify(); })
      .finally(() => { inflight = null; });
    return inflight;
  }
  queueMicrotask(() => load(false));
  return {
    loader: () => {},
    calc: (id, o) => { calcs[id] = { inputs: o.inputs || [], fn: o.fn }; },
    data: (id) => state[id] || { status: 'loading', data: [] },
    raw: () => raw,
    onData: (f) => { listeners.push(f); queueMicrotask(f); },
    refresh: () => load(true),
    colors: ['var(--jt-c0)', 'var(--jt-c1)', 'var(--jt-c2)', 'var(--jt-c3)', 'var(--jt-c4)']
  };
})();
