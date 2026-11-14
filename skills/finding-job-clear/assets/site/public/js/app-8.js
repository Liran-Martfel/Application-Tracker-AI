(() => {
  // Nika in the dashboard: the same assistant as on Telegram (src/nika.js through /api/private/nika), with the same
  // conversation, the same tools and the same approvals. Only the interview practice tab still talks to Gemini directly.
  if (window.__jobAgent) return; window.__jobAgent = true;
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s\-_.,()'"׳״]/g, '');
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v); } kids.flat().forEach(k => k != null && e.append(k)); return e; };
  const errText = (e) => String(e?.message || e?.result?.content?.[0]?.text || e?.code || e || '');

  let data = { applications: [], events: [], prep: [], job_leads: [] }, loadedAt = 0;
  let cv = null, prefs = [];
  let shown = '';   // the last message of the conversation on screen (to redraw only when Telegram added something)
  const lastOf = (history) => JSON.stringify((history || []).slice(-1));
  let mode = 'chat', practice = null, busy = false, opened = false;

  // ---------- UI ----------
  const root = el('div', { class: 'ja', dir: 'rtl', lang: 'he' });
  const fab = el('button', { class: 'ja-fab', type: 'button', 'aria-label': 'פתיחת הצ\'אט עם ניקה', 'aria-expanded': 'false', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4.5"/></svg>' });
  const panel = el('section', { class: 'ja-panel', role: 'dialog', 'aria-label': 'ניקה', hidden: '' });
  const dot = el('span', { class: 'ja-dot' });
  const sub = el('small', { text: 'אותה שיחה כמו בטלגרם' });
  const gear = el('button', { class: 'ja-ib', type: 'button', 'aria-label': 'הגדרות: קורות חיים והעדפות', text: '⚙' });
  const clear = el('button', { class: 'ja-ib', type: 'button', 'aria-label': 'שיחה חדשה (גם בטלגרם)', title: 'שיחה חדשה (גם בטלגרם)', text: '↺' });
  const close = el('button', { class: 'ja-ib', type: 'button', 'aria-label': 'סגירה', text: '✕' });
  const head = el('div', { class: 'ja-head' }, dot, el('h3', {}, 'ניקה', sub), gear, clear, close);
  const tChat = el('button', { class: 'ja-tab', type: 'button', 'aria-pressed': 'true', text: 'שיחה' });
  const tPrac = el('button', { class: 'ja-tab', type: 'button', 'aria-pressed': 'false', text: 'תרגול ראיון' });
  const tabs = el('div', { class: 'ja-tabs' }, tChat, tPrac);
  const body = el('div', { class: 'ja-body', 'aria-live': 'polite' });
  const settings = el('div', { class: 'ja-body ja-settings', hidden: '' });
  const pSel = el('select', { 'aria-label': 'משרה לתרגול' });
  const pLang = el('select', { 'aria-label': 'שפת הראיון' }, el('option', { value: 'he', text: 'עברית' }), el('option', { value: 'en', text: 'English' }));
  const pStart = el('button', { class: 'ja-btn', type: 'button', text: 'להתחיל ראיון' });
  const pEnd = el('button', { class: 'ja-btn sec', type: 'button', text: 'סיכום וציון', disabled: '' });
  const pBar = el('div', { class: 'ja-practice', hidden: '' }, pSel, el('div', { class: 'ja-row' }, pLang, pStart, pEnd));
  const q = el('textarea', { rows: '1', placeholder: 'לכתוב לניקה…', 'aria-label': 'הודעה לניקה' });
  const send = el('button', { class: 'ja-send', type: 'submit', 'aria-label': 'שליחה', html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>' });
  const form = el('form', { class: 'ja-ask' }, q, send);
  const foot = el('div', { class: 'ja-foot' }, pBar, form);
  panel.append(head, tabs, body, settings, foot);
  root.append(panel, fab);
  document.body.append(root);

  const setStatus = (cls, text) => { dot.className = 'ja-dot ' + cls; sub.textContent = text; };
  // Nika writes *bold* and "• " lines: bold becomes <b>, everything else stays plain text (never innerHTML)
  function rich(text) {
    const f = document.createDocumentFragment();
    String(text ?? '').split(/\*([^*\n]+)\*/).forEach((part, i) => { if (part) f.append(i % 2 ? el('b', { text: part }) : document.createTextNode(part.replace(/\*/g, ''))); });
    return f;
  }
  function welcome(history = []) {
    body.textContent = '';
    const chips = el('div', { class: 'ja-chips' });
    [['מה מחכה לי?', 'מה מחכה לי השבוע? למי צריך לענות ולמי לשלוח פולואפ?'], ['איזו משרה הכי מתאימה?', 'איזו משרה מהמשרות המומלצות הכי מתאימה לי עכשיו, ולמה?'], ['עדכון על שיחה', 'דיברתי היום בטלפון עם מגייסת מ-'], ['ניסוח מייל', 'תנסחי לי מייל פולואפ קצר ל-'], ['התאמת קורות חיים', 'תבדקי את ההתאמה שלי למשרה הכי מתאימה: מה מתאים, מה חסר ומה להדגיש.']]
      .forEach(([t, v]) => { const c = el('button', { class: 'ja-chip', type: 'button', text: t }); c.addEventListener('click', () => { q.value = v; q.focus({ preventScroll: true }); }); chips.append(c); });
    body.append(el('div', { class: 'ja-welcome', text: 'היי, אני ניקה 👋 אותה ניקה מהטלגרם, וזו אותה שיחה: מה שכתבת לי שם אני יודעת גם כאן. אני רואה את ההגשות, המשרות המומלצות והאירועים. אפשר לשאול, לספר על שיחה או ראיון, ולבקש טיוטת מייל. כל שינוי מחכה לאישור שלך.' }), chips);
    history.forEach(h => addMsg(h.role === 'user' ? 'me' : 'ai', h.text));
    shown = lastOf(history);
  }
  function addMsg(kind, text, meta) {
    const m = el('div', { class: 'ja-msg ' + kind }); const t = el('div');
    t.append(kind === 'ai' ? rich(text) : document.createTextNode(String(text ?? '')));
    m.append(t); if (meta) m.append(el('span', { class: 'ja-meta', text: meta }));
    body.append(m); body.scrollTop = body.scrollHeight; return { m, t };
  }
  function beginAI() {
    const { m, t } = addMsg('ai', ''); t.append(el('span', { class: 'ja-typing', html: '<i></i><i></i><i></i>' }));
    const note = el('span', { class: 'ja-note' }); m.append(note);
    busy = true; send.disabled = true;
    const end = () => { note.remove(); busy = false; send.disabled = false; };
    return {
      status: (s) => { note.textContent = s; body.scrollTop = body.scrollHeight; },
      done: (reply, meta, cards) => { end(); t.textContent = ''; t.append(rich(reply || 'לא התקבלה תשובה.')); if (meta) m.append(el('span', { class: 'ja-meta', text: meta })); (cards || []).forEach(c => m.append(c)); body.scrollTop = body.scrollHeight; },
      fail: (msg) => { end(); m.className = 'ja-msg err'; t.textContent = msg; }
    };
  }

  // ---------- data (from the page's own dash store: practice jobs, card titles, the CV in settings) ----------
  const apps = () => data.applications || [], leads = () => data.job_leads || [];
  async function loadData(force) {
    if (force) await window.dash.refresh();
    ['applications', 'events', 'prep', 'job_leads'].forEach((id) => { const d = window.dash.data(id); if (d.status === 'ok') data[id] = d.data || []; });
    const c = window.dash.raw()?.cv || {};
    const text = [c.text_he, c.text_en].filter(Boolean).join('\n\n---\n\n');
    cv = text ? { text, he: c.text_he || '', en: c.text_en || '' } : null;
    loadedAt = Date.now();
  }

  // ---------- Nika: /api/private/nika (the same core, history and approvals as on Telegram) ----------
  function friendly(e) {
    const c = e?.code || errText(e);
    if (/rate_limited/.test(c)) return 'יותר מדי הודעות ברגע. אפשר לנסות שוב בעוד דקה.';
    if (/unauthorized/.test(c)) return 'צריך להתחבר מחדש.';
    if (/not_configured/.test(c)) return 'ניקה לא מוגדרת בשרת.';
    return 'ניקה לא הצליחה לענות כרגע. אפשר לנסות שוב.';
  }
  const nika = (payload) => window.SITE.api('/api/private/nika' + (payload.id ? '/decide' : ''), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  async function syncHistory() {
    if (busy) return;
    try {
      const j = await window.SITE.api('/api/private/nika');
      if (!busy && lastOf(j.history) !== shown) welcome(j.history || []);
      setStatus('on', 'אותה שיחה כמו בטלגרם');
    } catch { setStatus('off', 'אין חיבור לניקה'); }
  }

  // a proposal from Nika: nothing happens before {{FIRST_NAME_EN}} presses; the server runs it once (a second press finds nothing)
  const LABEL = { update_application: 'עדכון הגשה', add_application: 'הגשה חדשה', add_event: 'אירוע חדש', remove_lead: 'הסרת משרה מומלצת', add_reminder: 'תזכורת בטלגרם', create_draft: 'טיוטת מייל' };
  const FIELD = { warning: 'לתשומת לב', company: 'חברה', role: 'תפקיד', job_id: 'מס׳ משרה', channel: 'ערוץ', applied: 'הוגש', status: 'סטטוס', next_step: 'צעד הבא', note: 'הערה', date: 'תאריך', kind: 'סוג', text: 'תיאור', reason: 'סיבה', followup_sent: 'פולואפ נשלח', when: 'מתי' };
  function titleOf(p) {
    const f = p.fields || {};
    const x = p.type === 'update_application' ? apps().find(r => r.id === f.id) : p.type === 'remove_lead' ? leads().find(r => r.id === f.id) : null;
    // the server writes the title from the action itself (never the model's own label)
    return x ? (LABEL[p.type] || 'פעולה') + ': ' + `${x.company} – ${x.role}` : (p.title || LABEL[p.type] || 'פעולה');
  }
  async function decideCard(p, ok, edits, st, buttons, card) {
    buttons.forEach(b => { b.disabled = true; }); st.textContent = ok ? 'מבצעת…' : 'מבטלת…';
    try {
      const r = await nika({ id: p.id, ok, ...(edits ? { edits } : {}) });
      st.textContent = r.message || '';
      if (r.status === 'done' && p.type === 'create_draft') { st.textContent = 'נשמרה ב-Gmail (לא נשלחה). '; st.append(el('a', { href: window.safeHref(r.url, 'https://mail.google.com/mail/#drafts'), target: '_blank', rel: 'noopener', text: 'לפתיחה' })); }
      if (r.status === 'done' && p.type !== 'add_reminder' && p.type !== 'create_draft') { st.textContent = 'עודכן בדשבורד ✓'; loadData(true); }
      if (r.status === 'failed') { st.textContent = r.message || 'לא הצליח.'; }
      card.style.opacity = '.75';
    } catch (e) { st.textContent = friendly(e); buttons.forEach(b => { b.disabled = false; }); }
  }
  function actionCard(p) {
    const dl = el('dl');
    Object.entries(p.fields || {}).forEach(([k, v]) => { if (k === 'id' || !FIELD[k]) return; dl.append(el('dt', { text: FIELD[k] }), el('dd', { text: v })); });
    const ok = el('button', { class: 'ja-btn', type: 'button', text: p.type === 'add_reminder' ? 'לקבוע תזכורת' : 'לאשר ולעדכן' });
    const no = el('button', { class: 'ja-btn sec', type: 'button', text: 'לא' });
    const st = el('span', { class: 'ja-hint' });
    const card = el('div', { class: 'ja-card', 'data-proposal': p.id }, el('b', { text: titleOf(p) }), dl, el('div', { class: 'ja-row' }, ok, no, st));
    ok.addEventListener('click', () => decideCard(p, true, null, st, [ok, no], card));
    no.addEventListener('click', () => decideCard(p, false, null, st, [ok, no], card));
    return card;
  }
  function emailCard(p) {
    const f = p.fields || {};
    const to = el('input', { type: 'text', value: f.to || '', placeholder: 'נמען', dir: 'ltr', 'aria-label': 'נמען' });
    const sj = el('input', { type: 'text', value: f.subject || '', placeholder: 'נושא', 'aria-label': 'נושא' });
    const bd = el('textarea', { rows: '7', 'aria-label': 'גוף המייל' }); bd.value = f.body || '';
    const mk = el('button', { class: 'ja-btn', type: 'button', text: 'טיוטה ב-Gmail' });
    const cp = el('button', { class: 'ja-btn sec', type: 'button', text: 'העתקה' });
    const no = el('button', { class: 'ja-btn sec', type: 'button', text: 'לא' });
    const st = el('span', { class: 'ja-hint' });
    const warn = f.warning ? el('p', { class: 'ja-hint', text: '⚠️ ' + f.warning }) : null;
    const card = el('div', { class: 'ja-card', 'data-proposal': p.id }, el('b', { text: 'טיוטת מייל' }), warn, to, sj, bd, el('div', { class: 'ja-row' }, mk, cp, no, st));
    cp.addEventListener('click', async () => { const tx = (sj.value ? sj.value + '\n\n' : '') + bd.value; try { await navigator.clipboard.writeText(tx); st.textContent = 'הועתק.'; } catch { bd.focus({ preventScroll: true }); bd.select(); try { document.execCommand('copy'); st.textContent = 'הועתק.'; } catch { st.textContent = 'לסמן ולהעתיק.'; } } });
    mk.addEventListener('click', () => {
      const addr = to.value.trim(); if (addr && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { st.textContent = 'כתובת לא תקינה.'; return; }
      decideCard(p, true, { to: addr, subject: sj.value, body: bd.value }, st, [mk, no], card);
    });
    no.addEventListener('click', () => decideCard(p, false, null, st, [mk, no], card));
    return card;
  }

  // ---------- preferences (this browser; sent with each message from the dashboard) + CV (read-only, from the Sheet) ----------
  async function savePrefs(list) { prefs = list.slice(-40); store.set('ja.prefs', prefs); renderSettings(); return true; }
  async function addPref(t) { t = String(t || '').trim().slice(0, 200); if (!t || prefs.some(p => norm(p.text) === norm(t))) return true; return savePrefs([...prefs, { id: 'p' + Date.now().toString(36), text: t }]); }
  function renderSettings() {
    settings.textContent = '';
    const cvBox = el('div');
    if (!cv) cvBox.append(el('p', { class: 'ja-hint', text: 'לא מצאתי קורות חיים בגיליון (הלשונית "קורות חיים", השורות text_he ו-text_en).' }));
    [['עברית', cv?.he], ['English', cv?.en]].forEach(([label, text]) => {
      if (!text) return;
      const ta = el('textarea', { rows: '8', readonly: '', 'aria-label': 'קורות חיים — ' + label, style: 'width:100%' }); ta.value = text;
      const d = el('details', {}, el('summary', { text: `${label} · ${text.length.toLocaleString('he-IL')} תווים` }), ta);
      cvBox.append(d);
    });
    const ul = el('ul', { class: 'ja-mem' });
    if (!prefs.length) ul.append(el('li', {}, el('span', { class: 'ja-hint', text: 'עוד לא נשמר כלום. למשל: מעדיף משרה היברידית.' })));
    prefs.forEach(p => { const x = el('button', { class: 'ja-ib', type: 'button', 'aria-label': 'מחיקה', text: '✕' }); x.addEventListener('click', () => savePrefs(prefs.filter(y => y.id !== p.id))); ul.append(el('li', {}, el('span', { text: p.text }), x)); });
    const memIn = el('input', { type: 'text', placeholder: 'למשל: מעדיף משרה היברידית', 'aria-label': 'העדפה חדשה' });
    const memAdd = el('button', { class: 'ja-btn sec', type: 'button', text: 'הוספה' });
    memAdd.addEventListener('click', async () => { if (await addPref(memIn.value)) memIn.value = ''; });
    const back = el('button', { class: 'ja-btn sec', type: 'button', text: 'חזרה לשיחה' }); back.addEventListener('click', () => showSettings(false));
    // Telegram: points the bot at this site (a POST from this page while signed in; a plain link does nothing)
    const tgSt = el('span', { class: 'ja-hint' });
    const tgBtn = el('button', { class: 'ja-btn sec', type: 'button', text: 'חיבור הבוט בטלגרם' });
    tgBtn.addEventListener('click', async () => {
      tgBtn.disabled = true; tgSt.textContent = 'מחברת…';
      try { await window.SITE.api('/api/private/telegram/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); tgSt.textContent = 'מחובר ✓ ניקה שלחה הודעה בטלגרם.'; }
      catch (e) { tgSt.textContent = /not_configured/.test(errText(e)) ? 'חסרים TELEGRAM_BOT_TOKEN או TELEGRAM_CHAT_ID באתר.' : 'החיבור לא הצליח. אפשר לנסות שוב.'; }
      finally { tgBtn.disabled = false; }
    });
    // sign out on every device (a new session epoch on the server); this device signs in again too
    const allBtn = el('button', { class: 'ja-btn sec', type: 'button', text: 'יציאה מכל המכשירים' });
    allBtn.addEventListener('click', async () => {
      if (!confirm('לצאת מהדשבורד בכל המכשירים, כולל זה?')) return;
      try { await window.SITE.api('/api/private/logout-all', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch {}
      location.href = '/app';
    });
    settings.append(el('div', {}, el('h4', { text: 'קורות חיים' }), el('p', { class: 'ja-hint', text: 'לקריאה בלבד, מהגיליון. כדי לעדכן — משנים בלשונית "קורות חיים" בגיליון.' }), cvBox),
      el('div', {}, el('h4', { text: 'העדפות שניקה מקבלת מהדשבורד' }), ul, el('div', { class: 'ja-row', style: 'margin-top:6px' }, memIn, memAdd), el('p', { class: 'ja-hint', text: 'נשמר רק בדפדפן הזה, ונשלח לניקה עם כל הודעה מכאן.' })),
      el('div', {}, el('h4', { text: 'מי עונה' }), el('p', { class: 'ja-hint', text: 'ניקה: אותה עוזרת ואותה שיחה כמו בטלגרם (Gemini 2.5 Flash דרך השרת של האתר). תרגול הראיון עונה ישירות מ-Gemini.' })),
      el('div', {}, el('h4', { text: 'טלגרם וחשבון' }), el('div', { class: 'ja-row' }, tgBtn, allBtn), tgSt), back);
  }
  function showSettings(on) { settings.hidden = !on; body.hidden = on; foot.hidden = on; tabs.hidden = on; if (on) { loadData(); renderSettings(); } }

  // ---------- interview practice (its own interviewer, through /api/private/gen; not part of Nika's conversation) ----------
  const PROFILE = '{{AGENT_PROFILE_HE}}';
  function practiceSystem(job, lang) {
    const prep = (data.prep || []).find(p => norm(p.company) === norm(job.company));
    const lead = leads().find(l => l.id === job.id);
    const he = lang === 'he';
    return `${he ? 'אתה מראיין עבודה' : 'You are a job interviewer'} at ${job.company} for "${job.role}"${job.job_id ? ' (' + job.job_id + ')' : ''}. Candidate: ${PROFILE}
${prep ? 'Prep: ' + [prep.about, prep.questions, prep.todo].filter(Boolean).join(' | ') : ''}${lead?.role_desc ? '\nRole: ' + lead.role_desc : ''}${cv?.text ? '\nCV: ' + cv.text.slice(0, 2000) : ''}
${he ? 'כללים: עברית. שאלה אחת בכל פעם ומחכים. אחרי כל תשובה: שורה אחת מה היה טוב, שורה אחת מה לשפר (קונקרטי), ואז השאלה הבאה. בלי מחמאות ריקות. כשמבקשים "סיכום": 3 חוזקות, 3 דברים לשפר, וציון 1–10 עם הסבר קצר.' : 'Rules: English. One question at a time, then wait. After each answer: one line on what was good, one concrete line to improve, then the next question. No empty praise. On "summary": 3 strengths, 3 improvements, a 1-10 score with a short reason.'}`;
  }
  function genFriendly(e) {
    const c = e?.code || errText(e);
    if (/rate_limited/.test(c)) return 'יותר מדי בקשות ברגע. אפשר לנסות שוב בעוד דקה.';
    if (/no_key/.test(c)) return 'מפתח Gemini לא מוגדר באתר.';
    if (/unauthorized/.test(c)) return 'צריך להתחבר מחדש.';
    return 'Gemini לא הצליח לענות כרגע. אפשר לנסות שוב.';
  }
  function fillJobs() {
    const cur = pSel.value; pSel.textContent = '';
    const opts = [...apps().filter(a => ['בתהליך', 'ראיון', 'הצעה'].includes(a.status)).map(a => ({ id: a.id, company: a.company, role: a.role, job_id: a.job_id, tag: 'בתהליך' })),
      ...apps().filter(a => a.status === 'הוגש' && a.relevant !== false).map(a => ({ id: a.id, company: a.company, role: a.role, job_id: a.job_id, tag: 'הוגש' })),
      ...leads().filter(l => l.fit === 'מתאים מאוד').map(l => ({ id: l.id, company: l.company, role: l.role, tag: 'מומלצת' }))];
    if (!opts.length) pSel.append(el('option', { value: '', text: 'טוען משרות…' }));
    opts.forEach(o => pSel.append(el('option', { value: JSON.stringify(o), text: `${o.company} – ${o.role} (${o.tag})` })));
    if ([...pSel.options].some(o => o.value === cur)) pSel.value = cur;
  }
  function setMode(m) { mode = m; tChat.setAttribute('aria-pressed', String(m === 'chat')); tPrac.setAttribute('aria-pressed', String(m === 'practice')); pBar.hidden = m !== 'practice'; q.placeholder = m === 'practice' ? 'התשובה שלך למראיין…' : 'לכתוב לניקה…'; if (m === 'practice') fillJobs(); }
  async function practiceTurn(text) {
    const ui = beginAI(); const t0 = Date.now();
    try {
      practice.msgs.push({ role: 'user', content: text });
      ui.status('המראיין חושב…');
      const history = practice.msgs.slice(0, -1).map((t) => ({ role: t.role, text: String(t.content || '') }));
      let reply;
      try { reply = await window.SITE.gen(text, { system: practiceSystem(practice.job, practice.lang), history }); } catch (e) { throw { message: genFriendly(e) }; }
      practice.msgs.push({ role: 'assistant', content: reply });
      ui.done(reply, `Gemini · ${Math.max(1, Math.round((Date.now() - t0) / 1000))} שנ׳`);
    } catch (e) { practice.msgs.pop(); ui.fail(errText(e)); }
  }
  pStart.addEventListener('click', () => { if (!pSel.value) return; practice = { job: JSON.parse(pSel.value), lang: pLang.value, msgs: [] }; pEnd.disabled = false; addMsg('me', `▶ תרגול ראיון: ${practice.job.company} – ${practice.job.role}`); practiceTurn(practice.lang === 'he' ? 'בוא נתחיל. תציג את עצמך בקצרה ותשאל את השאלה הראשונה.' : "Let's start. Introduce yourself briefly and ask the first question."); });
  pEnd.addEventListener('click', () => { if (!practice) return; addMsg('me', 'סיכום'); practiceTurn(practice.lang === 'he' ? 'סיכום' : 'summary'); pEnd.disabled = true; });

  // ---------- chat with Nika ----------
  async function ask(text) {
    const ui = beginAI(); const t0 = Date.now();
    ui.status('ניקה כותבת…');
    try {
      if (!loadedAt) await loadData(); else loadData();
      const r = await nika({ text, notes: prefs.map(p => p.text) });
      if (r.failed) { ui.fail(r.reply); return; }
      const cards = (r.proposals || []).map(p => (p.type === 'create_draft' ? emailCard(p) : actionCard(p)));
      ui.done(r.reply, `ניקה · ${Math.max(1, Math.round((Date.now() - t0) / 1000))} שנ׳`, cards);
      if (/^\/new\b/.test(text)) { welcome([]); return; }
      if (!text.startsWith('/')) shown = lastOf([{ role: 'assistant', text: r.reply }]);   // commands are not kept in the conversation
    } catch (e) { ui.fail(friendly(e)); }
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault(); const text = q.value.trim(); if (!text || busy) return;
    q.value = ''; q.style.height = '';
    addMsg('me', text);
    if (mode === 'practice') { if (!practice) { addMsg('err', 'קודם בוחרים משרה ולוחצים "להתחיל ראיון".'); return; } practiceTurn(text); }
    else ask(text);
  });
  q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  q.addEventListener('input', () => { q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, 120) + 'px'; });

  // ---------- open / close ----------
  const PHONE = () => matchMedia('(max-width: 600px)').matches;
  function fitPhone() {
    const vv = window.visualViewport;
    if (!opened || !PHONE() || !vv) { panel.style.removeProperty('--ja-h'); panel.style.removeProperty('--ja-top'); return; }
    panel.style.setProperty('--ja-h', Math.round(vv.height) + 'px');
    panel.style.setProperty('--ja-top', Math.round(vv.offsetTop) + 'px');
    body.scrollTop = body.scrollHeight;
  }
  window.visualViewport?.addEventListener('resize', fitPhone);
  window.visualViewport?.addEventListener('scroll', fitPhone);
  window.addEventListener('resize', fitPhone);
  function toggle(on) {
    opened = on ?? !opened; panel.hidden = !opened; fab.setAttribute('aria-expanded', String(opened));
    fab.innerHTML = opened ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4.5"/></svg>';
    root.classList.toggle('is-open', opened); fitPhone();
    if (opened) { if (!PHONE()) q.focus({ preventScroll: true }); loadData(); if (mode === 'chat') syncHistory(); }
  }
  fab.addEventListener('click', () => toggle());
  close.addEventListener('click', () => toggle(false));
  gear.addEventListener('click', () => showSettings(settings.hidden));
  // a new conversation is shared too: the same as /new on Telegram
  clear.addEventListener('click', async () => {
    if (busy) return;
    practice = null; pEnd.disabled = true;
    try { await nika({ text: '/new' }); welcome([]); } catch (e) { addMsg('err', friendly(e)); }
  });
  tChat.addEventListener('click', () => setMode('chat')); tPrac.addEventListener('click', () => setMode('practice'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && opened) toggle(false); });

  welcome();
  prefs = store.get('ja.prefs', []);
  try { localStorage.removeItem('ja.history'); } catch {}   // the old agent's own history; the conversation now lives with Nika
  setStatus('on', 'אותה שיחה כמו בטלגרם');
  window.dash.onData(() => { loadData(); if (mode === 'practice') fillJobs(); });
})();
