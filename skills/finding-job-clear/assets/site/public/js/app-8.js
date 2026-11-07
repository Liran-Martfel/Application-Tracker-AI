(() => {
  if (window.__jobAgent) return; window.__jobAgent = true;
  const STATUSES = ['הוגש','בתהליך','ראיון','הצעה','נדחה'], OPEN = ['הוגש','בתהליך','ראיון','הצעה'];
  const KINDS = ['הגשה','פנייה','תגובה','התקדמות','ראיון','הצעה','דחייה'];
  const TODAY = () => new Date().toISOString().slice(0, 10);
  const plusDays = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s\-_.,()'"׳״]/g, '');
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v); } kids.flat().forEach(k => k != null && e.append(k)); return e; };
  const errText = (e) => String(e?.message || e?.result?.content?.[0]?.text || e?.code || e || '');

  let data = { applications: [], events: [], prep: [], job_leads: [] }, loadedAt = 0;
  let cv = null, prefs = [];
  let history = store.get('ja.history', []).slice(-20);
  let mode = 'chat', practice = null, busy = false, opened = false;

  // ---------- UI ----------
  const root = el('div', { class: 'ja', dir: 'rtl', lang: 'he' });
  const fab = el('button', { class: 'ja-fab', type: 'button', 'aria-label': 'פתיחת סוכן המשרות', 'aria-expanded': 'false', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4.5"/></svg>' });
  const panel = el('section', { class: 'ja-panel', role: 'dialog', 'aria-label': 'סוכן המשרות', hidden: '' });
  const dot = el('span', { class: 'ja-dot' });
  const sub = el('small', { text: 'Gemini' });
  const gear = el('button', { class: 'ja-ib', type: 'button', 'aria-label': 'הגדרות: קורות חיים וזיכרון', text: '⚙' });
  const clear = el('button', { class: 'ja-ib', type: 'button', 'aria-label': 'ניקוי השיחה', text: '↺' });
  const close = el('button', { class: 'ja-ib', type: 'button', 'aria-label': 'סגירה', text: '✕' });
  const head = el('div', { class: 'ja-head' }, dot, el('h3', {}, 'סוכן המשרות', sub), gear, clear, close);
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
  const q = el('textarea', { rows: '1', placeholder: 'לשאול, לעדכן או לבקש מייל…', 'aria-label': 'הודעה לסוכן' });
  const send = el('button', { class: 'ja-send', type: 'submit', 'aria-label': 'שליחה', html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>' });
  const form = el('form', { class: 'ja-ask' }, q, send);
  const foot = el('div', { class: 'ja-foot' }, pBar, form);
  panel.append(head, tabs, body, settings, foot);
  root.append(panel, fab);
  document.body.append(root);

  const setStatus = (cls, text) => { dot.className = 'ja-dot ' + cls; sub.textContent = text; };
  function welcome() {
    body.textContent = '';
    const chips = el('div', { class: 'ja-chips' });
    [['מה מחכה לי?', 'מה מחכה לי השבוע? למי צריך לענות ולמי לשלוח פולואפ?'], ['איזו משרה הכי מתאימה?', 'איזו משרה מהמשרות המומלצות הכי מתאימה לי עכשיו, ולמה?'], ['עדכון על שיחה', 'דיברתי היום בטלפון עם מגייסת מ-'], ['ניסוח מייל', 'תנסח לי מייל פולואפ קצר ל-'], ['התאמת קורות חיים', 'תבדוק את ההתאמה של קורות החיים שלי למשרה הכי מתאימה: מה מתאים, מה חסר ומה להדגיש.']]
      .forEach(([t, v]) => { const c = el('button', { class: 'ja-chip', type: 'button', text: t }); c.addEventListener('click', () => { q.value = v; q.focus({ preventScroll: true }); }); chips.append(c); });
    body.append(el('div', { class: 'ja-welcome', text: 'אני מכיר את ההגשות, המשרות המומלצות והאירועים בדשבורד. אפשר לשאול, לספר על שיחת טלפון או ראיון, ולבקש ניסוח למייל. כל שינוי בדשבורד מחכה לאישור שלך.' }), chips);
    history.forEach(h => addMsg(h.role === 'user' ? 'me' : 'ai', h.text));
  }
  function addMsg(kind, text, meta) {
    const m = el('div', { class: 'ja-msg ' + kind }); const t = el('div', { text });
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
      text: (s) => { if (s) { t.textContent = s; body.scrollTop = body.scrollHeight; } },
      attach: (n) => m.append(n),
      done: (reply, meta, cards) => { end(); t.textContent = reply || 'לא התקבלה תשובה.'; m.append(el('span', { class: 'ja-meta', text: meta })); (cards || []).forEach(c => m.append(c)); body.scrollTop = body.scrollHeight; },
      fail: (msg) => { end(); m.className = 'ja-msg err'; t.textContent = msg; }
    };
  }

  // ---------- data (from the page's own dash store) ----------
  const apps = () => data.applications || [], leads = () => data.job_leads || [], evs = () => data.events || [];
  async function loadData(force) {
    if (force) await window.dash.refresh();
    ['applications', 'events', 'prep', 'job_leads'].forEach((id) => { const d = window.dash.data(id); if (d.status === 'ok') data[id] = d.data || []; });
    const c = window.dash.raw()?.cv || {};
    const text = [c.text_he, c.text_en].filter(Boolean).join('\n\n---\n\n');
    cv = text ? { text, he: c.text_he || '', en: c.text_en || '' } : null;
    loadedAt = Date.now();
  }

  // ---------- model calls: Gemini through /api/private/gen ----------
  function friendly(e) {
    const c = e?.code || errText(e);
    if (/rate_limited/.test(c)) return 'יותר מדי בקשות ברגע. אפשר לנסות שוב בעוד דקה.';
    if (/no_key/.test(c)) return 'מפתח Gemini לא מוגדר באתר.';
    if (/unauthorized/.test(c)) return 'צריך להתחבר מחדש.';
    return 'Gemini לא הצליח לענות כרגע. נסה שוב.';
  }
  async function answer(sys, turns, heavy, json, ui) {
    const t0 = Date.now();
    ui?.status('Gemini עונה…');
    const last = turns.at(-1) || { content: '' };
    const history = turns.slice(0, -1).map((t) => ({ role: t.role === 'assistant' ? 'assistant' : 'user', text: String(t.content || '') }));
    try {
      const text = await window.SITE.gen(String(last.content || '…'), { system: sys, history, json });
      return { text, j: json ? extractJSON(text) : null, meta: `Gemini · ${Math.max(1, Math.round((Date.now() - t0) / 1000))} שנ׳` };
    } catch (e) { throw { message: friendly(e) }; }
  }
  // ---------- prompts ----------
  const PROFILE = '{{AGENT_PROFILE_HE}}';
  const WRITING = 'מיילים: כתיבה טבעית ואנושית, 4–7 שורות, תפקיד ומספר משרה מדויקים, בלי passionate / leverage / "בעל מוטיבציה גבוהה", בלי אימוג\'ים. עברית לחברה ישראלית, אנגלית לבינלאומית. חתימה: "{{NAME_HE}} | {{EMAIL}}".';
  const short = (a) => ({ id: a.id, company: a.company, role: a.role, job_id: a.job_id, status: a.status, applied: a.applied, channel: a.channel, next_step: a.next_step, direct_contact: a.direct_contact || undefined, relevant: a.relevant === false ? 'לא רלוונטי' : undefined });
  function context(text) {
    const words = text.split(/[\s,.;:!?()\-–"'׳״]+/).map(norm).filter(w => w.length >= 3);
    const hit = (o) => { const h = norm(Object.values(o).join(' ')); return words.some(w => h.includes(w)); };
    const A = apps().filter(a => hit({ c: a.company, r: a.role, j: a.job_id }));
    const L = leads().filter(l => hit({ c: l.company, r: l.role }));
    const out = [];
    if (A.length) out.push('הגשות שקשורות לשאלה: ' + JSON.stringify(A.slice(0, 6).map(short)));
    if (A.length) { const P = (data.prep || []).filter(p => A.some(a => norm(a.company) === norm(p.company))); if (P.length) out.push('הכנה לראיון: ' + JSON.stringify(P.slice(0, 2))); const E = evs().filter(e => A.some(a => norm(a.company) === norm(e.company))).slice(-6).map(e => ({ date: e.date, kind: e.kind, text: e.text, mail_state: e.mail_state })); if (E.length) out.push('אירועים: ' + JSON.stringify(E)); }
    if (L.length) out.push('משרות מומלצות שקשורות: ' + JSON.stringify(L.slice(0, 5).map(l => ({ id: l.id, company: l.company, role: l.role, fit: l.fit, location: l.location, role_desc: l.role_desc }))));
    if (/משר(ה|ות)|מתאים|להגיש|מומלצ/.test(text) && !L.length) out.push('המשרות המומלצות הכי מתאימות: ' + JSON.stringify(leads().filter(l => l.fit === 'מתאים מאוד').slice(0, 6).map(l => ({ id: l.id, company: l.company, role: l.role, location: l.location, role_desc: l.role_desc }))));
    if (/מחכה|לענות|פולואפ|השבוע|מה יש|תזכיר|דחוף/.test(text)) out.push('מחכה לתשובה: ' + JSON.stringify(evs().filter(e => /מחכה לתגובה|לא נקרא/.test(e.mail_state || '')).slice(-8).map(e => ({ date: e.date, company: e.company, role: e.role, text: e.text, mail_state: e.mail_state }))) + '\nהגשות פתוחות עם צעד הבא: ' + JSON.stringify(apps().filter(a => OPEN.includes(a.status) && a.relevant !== false && a.next_step).slice(0, 12).map(short)));
    if (!out.length) out.push('כל ההגשות (id | חברה | תפקיד | סטטוס):\n' + apps().map(a => `${a.id} | ${a.company} | ${a.role} | ${a.status}`).join('\n') + '\nמשרות מומלצות (id | חברה | תפקיד | התאמה):\n' + leads().map(l => `${l.id} | ${l.company} | ${l.role} | ${l.fit}`).join('\n'));
    if (cv?.text && /קורות|התאמ|cv|מתאים לי|להדגיש|חסר/i.test(text)) out.push('קורות החיים של המשתמש:\n' + cv.text.slice(0, 3500));
    return out.join('\n');
  }
  const system = (text) => `אתה "סוכן המשרות" של ${PROFILE}
היום ${TODAY()}. יש ${apps().length} הגשות ו-${leads().length} משרות מומלצות.
${prefs.length ? 'העדפות שהמשתמש ביקש לזכור: ' + prefs.map(p => p.text).join('; ') : ''}
נתונים אמיתיים מהדשבורד:
${context(text)}
עונים רק על סמך הנתונים. לא ממציאים חברות, תאריכים, דרישות או כתובות. אם משהו לא מופיע — אומרים שלא מצאת.
${WRITING}
מחזירים JSON בלבד: {"reply":"תשובה בעברית תקינה ופשוטה","actions":[],"email":null,"remember":null}
actions ריק כברירת מחדל. מוסיפים פעולה רק כשהמשתמש מספר על משהו חדש שקרה. סוגים: {"type":"update_application","id":"<id>","status":"הוגש|בתהליך|ראיון|הצעה|נדחה","next_step":"","note":""} / {"type":"add_application","company":"","role":"","job_id":"","channel":"","applied":"YYYY-MM-DD"} / {"type":"add_event","company":"","role":"","date":"YYYY-MM-DD","kind":"פנייה|תגובה|התקדמות|ראיון|הצעה|דחייה","text":""} / {"type":"remove_lead","id":"<id>","reason":""}
email: null, אלא אם ביקש מייל: {"to":"","subject":"","body":""}. remember: טקסט רק כשאמר "תזכור". בלי מספרי טלפון ושמות של מגייסים.`;
  function practiceSystem(job, lang) {
    const prep = (data.prep || []).find(p => norm(p.company) === norm(job.company));
    const lead = leads().find(l => l.id === job.id);
    const he = lang === 'he';
    return `${he ? 'אתה מראיין עבודה' : 'You are a job interviewer'} at ${job.company} for "${job.role}"${job.job_id ? ' (' + job.job_id + ')' : ''}. Candidate: ${PROFILE}
${prep ? 'Prep: ' + [prep.about, prep.questions, prep.todo].filter(Boolean).join(' | ') : ''}${lead?.role_desc ? '\nRole: ' + lead.role_desc : ''}${cv?.text ? '\nCV: ' + cv.text.slice(0, 2000) : ''}
${he ? 'כללים: עברית. שאלה אחת בכל פעם ומחכים. אחרי כל תשובה: שורה אחת מה היה טוב, שורה אחת מה לשפר (קונקרטי), ואז השאלה הבאה. בלי מחמאות ריקות. כשמבקשים "סיכום": 3 חוזקות, 3 דברים לשפר, וציון 1–10 עם הסבר קצר.' : 'Rules: English. One question at a time, then wait. After each answer: one line on what was good, one concrete line to improve, then the next question. No empty praise. On "summary": 3 strengths, 3 improvements, a 1-10 score with a short reason.'}`;
  }
  function extractJSON(t) { if (!t) return null; try { return JSON.parse(t); } catch {} const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} } return null; }

  // ---------- applying an approved change straight into the dashboard ----------
  const LABEL = { update_application: 'עדכון הגשה', add_application: 'הגשה חדשה', add_event: 'אירוע חדש', remove_lead: 'הסרת משרה מומלצת' };
  const FIELD = { company: 'חברה', role: 'תפקיד', job_id: 'מס׳ משרה', channel: 'ערוץ', applied: 'הוגש', status: 'סטטוס', next_step: 'צעד הבא', note: 'הערה', date: 'תאריך', kind: 'סוג', text: 'תיאור', reason: 'סיבה' };
  function validate(a) {
    if (!a || !LABEL[a.type]) return null;
    const c = { type: a.type };
    for (const k of ['id', ...Object.keys(FIELD)]) if (a[k] != null && String(a[k]).trim() !== '') c[k] = String(a[k]).trim().replace(/\+?\d[\d\- ]{7,}\d/g, '[מספר הוסר]');
    if (c.status && !STATUSES.includes(c.status)) delete c.status;
    if (c.kind && !KINDS.includes(c.kind)) c.kind = 'התקדמות';
    if (c.type === 'update_application') { const x = apps().find(r => r.id === c.id); if (!x) return null; c._label = `${x.company} – ${x.role}`; if (!c.status && !c.next_step && !c.note) return null; }
    if (c.type === 'remove_lead') { const x = leads().find(r => r.id === c.id); if (!x) return null; c._label = `${x.company} – ${x.role}`; }
    if (c.type === 'add_application' && (!c.company || !c.role)) return null;
    if (c.type === 'add_event') { if (!c.company || !c.text) return null; c.date = c.date || TODAY(); }
    return c;
  }
  async function applyChange(c) {
    const t = TODAY(), act = window.SITE.action;
    const appOf = (company) => apps().find(r => norm(r.company).includes(norm(company)) || norm(company).includes(norm(r.company)));
    // the same follow-up rule the dashboard uses: 10 days after a status that waits on the company, none after a rejection
    const statusPatch = (status) => status === 'נדחה' ? { status, next_step: '', followup_after: '' } : (status === 'הוגש' || status === 'בתהליך') ? { status, followup_after: plusDays(t, 10) } : status ? { status } : {};
    if (c.type === 'update_application') {
      const row = apps().find(r => r.id === c.id); if (!row) throw new Error('ההגשה לא נמצאה');
      await act({ action: 'update_application', id: c.id, ...statusPatch(c.status), ...(c.next_step ? { next_step: c.next_step } : {}), ...(c.note ? { note: c.note } : {}) });
      if (!c.status || c.status === row.status) await act({ action: 'add_event', company: row.company, role: row.role, date: t, kind: 'התקדמות', text: 'עדכון ידני דרך הסוכן: ' + [c.next_step, c.note].filter(Boolean).join(' · ') });
    } else if (c.type === 'add_application') {
      if (apps().some(r => (norm(r.company) === norm(c.company) && norm(r.role) === norm(c.role)) || (c.job_id && r.job_id === c.job_id))) throw new Error('ההגשה כבר קיימת בדשבורד');
      await act({ action: 'add_application', company: c.company, role: c.role, job_id: c.job_id || '', channel: c.channel || 'אחר', applied: c.applied || t, status: c.status || 'הוגש', note: 'נוסף ידנית דרך הסוכן' + (c.note ? ' | ' + c.note : '') });
      const lead = leads().find(l => norm(l.company) === norm(c.company) && norm(l.role) === norm(c.role));
      if (lead) await act({ action: 'remove_lead', id: lead.id });
    } else if (c.type === 'add_event') {
      const row = appOf(c.company), status = c.kind === 'דחייה' ? 'נדחה' : c.kind;
      // a status change logs its own event in Api.gs, so send the text as its note instead of a second event
      if (row && ['ראיון', 'הצעה', 'דחייה'].includes(c.kind) && row.status !== status) await act({ action: 'update_application', id: row.id, ...statusPatch(status), note: c.text });
      else await act({ action: 'add_event', company: c.company, role: c.role || '', kind: c.kind || 'התקדמות', text: c.text, date: c.date || t });
    } else if (c.type === 'remove_lead') {
      await act({ action: 'remove_lead', id: c.id });
    }
    await loadData(true);
  }
  function actionCard(a) {
    const dl = el('dl');
    Object.entries(a).forEach(([k, v]) => { if (k === 'type' || k === '_label' || k === 'id') return; dl.append(el('dt', { text: FIELD[k] || k }), el('dd', { text: v })); });
    const ok = el('button', { class: 'ja-btn', type: 'button', text: 'לאשר ולעדכן' });
    const no = el('button', { class: 'ja-btn sec', type: 'button', text: 'לא' });
    const st = el('span', { class: 'ja-hint' });
    const card = el('div', { class: 'ja-card' }, el('b', { text: LABEL[a.type] + (a._label ? ': ' + a._label : '') }), dl, el('div', { class: 'ja-row' }, ok, no, st));
    ok.addEventListener('click', async () => {
      ok.disabled = no.disabled = true; st.textContent = 'מעדכן את הדשבורד…';
      const { _label, ...c } = a;
      try { await applyChange(c); st.textContent = 'עודכן בדשבורד ✓'; card.style.opacity = '.75'; }
      catch (e) {
        if (/כבר קיימת|לא נמצאה/.test(errText(e))) { st.textContent = errText(e); return; }
        st.textContent = 'העדכון נכשל. אפשר לנסות שוב.'; ok.disabled = no.disabled = false;
      }
    });
    no.addEventListener('click', () => card.remove());
    return card;
  }
  function emailCard(m) {
    const to = el('input', { type: 'text', value: m.to || '', placeholder: 'נמען', dir: 'ltr', 'aria-label': 'נמען' });
    const sj = el('input', { type: 'text', value: m.subject || '', placeholder: 'נושא', 'aria-label': 'נושא' });
    const bd = el('textarea', { rows: '7', 'aria-label': 'גוף המייל' }); bd.value = m.body || '';
    const mk = el('button', { class: 'ja-btn', type: 'button', text: 'טיוטה ב-Gmail' });
    const cp = el('button', { class: 'ja-btn sec', type: 'button', text: 'העתקה' });
    const st = el('span', { class: 'ja-hint' });
    cp.addEventListener('click', async () => { const tx = (sj.value ? sj.value + '\n\n' : '') + bd.value; try { await navigator.clipboard.writeText(tx); st.textContent = 'הועתק.'; } catch { bd.focus({ preventScroll: true }); bd.select(); try { document.execCommand('copy'); st.textContent = 'הועתק.'; } catch { st.textContent = 'סמן והעתק.'; } } });
    mk.addEventListener('click', async () => {
      const addr = to.value.trim(); if (addr && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) { st.textContent = 'כתובת לא תקינה.'; return; }
      mk.disabled = true; st.textContent = 'יוצר טיוטה…';
      try { const p = await window.SITE.action({ action: 'create_draft', to: addr, subject: sj.value, body: bd.value }); st.textContent = 'נשמרה ב-Gmail (לא נשלחה). '; st.append(el('a', { href: window.safeHref(p.url, 'https://mail.google.com/mail/#drafts'), target: '_blank', rel: 'noopener', text: 'לפתיחה' })); }
      catch { st.textContent = 'לא הצלחתי ליצור טיוטה. אפשר להעתיק.'; mk.disabled = false; }
    });
    return el('div', { class: 'ja-card' }, el('b', { text: 'טיוטת מייל' }), to, sj, bd, el('div', { class: 'ja-row' }, mk, cp, st));
  }

  // ---------- memory (this browser) + CV (read-only, from the Sheet) ----------
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
    if (!prefs.length) ul.append(el('li', {}, el('span', { class: 'ja-hint', text: 'עוד לא נשמר כלום. כותבים בשיחה "תזכור ש…".' })));
    prefs.forEach(p => { const x = el('button', { class: 'ja-ib', type: 'button', 'aria-label': 'מחיקה', text: '✕' }); x.addEventListener('click', () => savePrefs(prefs.filter(y => y.id !== p.id))); ul.append(el('li', {}, el('span', { text: p.text }), x)); });
    const memIn = el('input', { type: 'text', placeholder: 'למשל: מעדיף משרה היברידית', 'aria-label': 'העדפה חדשה' });
    const memAdd = el('button', { class: 'ja-btn sec', type: 'button', text: 'הוספה' });
    memAdd.addEventListener('click', async () => { if (await addPref(memIn.value)) memIn.value = ''; });
    const back = el('button', { class: 'ja-btn sec', type: 'button', text: 'חזרה לשיחה' }); back.addEventListener('click', () => showSettings(false));
    settings.append(el('div', {}, el('h4', { text: 'קורות חיים' }), el('p', { class: 'ja-hint', text: 'לקריאה בלבד, מהגיליון. כדי לעדכן — משנים בלשונית "קורות חיים" בגיליון.' }), cvBox),
      el('div', {}, el('h4', { text: 'מה הסוכן זוכר עליך' }), ul, el('div', { class: 'ja-row', style: 'margin-top:6px' }, memIn, memAdd), el('p', { class: 'ja-hint', text: 'נשמר רק בדפדפן הזה.' })),
      el('div', {}, el('h4', { text: 'מי עונה' }), el('p', { class: 'ja-hint', text: 'Gemini 2.5 Flash, דרך השרת של האתר. הנתונים נשלחים אליו רק כשאתה שואל.' })), back);
  }
  function showSettings(on) { settings.hidden = !on; body.hidden = on; foot.hidden = on; tabs.hidden = on; if (on) { loadData(); renderSettings(); } }
  // ---------- practice ----------
  function fillJobs() {
    const cur = pSel.value; pSel.textContent = '';
    const opts = [...apps().filter(a => ['בתהליך', 'ראיון', 'הצעה'].includes(a.status)).map(a => ({ id: a.id, company: a.company, role: a.role, job_id: a.job_id, tag: 'בתהליך' })),
      ...apps().filter(a => a.status === 'הוגש' && a.relevant !== false).map(a => ({ id: a.id, company: a.company, role: a.role, job_id: a.job_id, tag: 'הוגש' })),
      ...leads().filter(l => l.fit === 'מתאים מאוד').map(l => ({ id: l.id, company: l.company, role: l.role, tag: 'מומלצת' }))];
    if (!opts.length) pSel.append(el('option', { value: '', text: 'טוען משרות…' }));
    opts.forEach(o => pSel.append(el('option', { value: JSON.stringify(o), text: `${o.company} – ${o.role} (${o.tag})` })));
    if ([...pSel.options].some(o => o.value === cur)) pSel.value = cur;
  }
  function setMode(m) { mode = m; tChat.setAttribute('aria-pressed', String(m === 'chat')); tPrac.setAttribute('aria-pressed', String(m === 'practice')); pBar.hidden = m !== 'practice'; q.placeholder = m === 'practice' ? 'התשובה שלך למראיין…' : 'לשאול, לעדכן או לבקש מייל…'; if (m === 'practice') fillJobs(); }
  async function practiceTurn(text) {
    const ui = beginAI();
    try {
      practice.msgs.push({ role: 'user', content: text });
      const r = await answer(practiceSystem(practice.job, practice.lang), practice.msgs, true, false, ui);
      practice.msgs.push({ role: 'assistant', content: r.text });
      ui.done(r.text, r.meta);
    } catch (e) { practice.msgs.pop(); ui.fail(errText(e)); }
  }
  pStart.addEventListener('click', () => { if (!pSel.value) return; practice = { job: JSON.parse(pSel.value), lang: pLang.value, msgs: [] }; pEnd.disabled = false; addMsg('me', `▶ תרגול ראיון: ${practice.job.company} – ${practice.job.role}`); practiceTurn(practice.lang === 'he' ? 'בוא נתחיל. תציג את עצמך בקצרה ותשאל את השאלה הראשונה.' : "Let's start. Introduce yourself briefly and ask the first question."); });
  pEnd.addEventListener('click', () => { if (!practice) return; addMsg('me', 'סיכום'); practiceTurn(practice.lang === 'he' ? 'סיכום' : 'summary'); pEnd.disabled = true; });

  // ---------- chat ----------
  async function ask(text) {
    const ui = beginAI();
    try {
      if (!loadedAt) await loadData(); else loadData();
      const base = history.slice(-4).map(h => h.role === 'user' ? { role: 'user', content: h.text } : { role: 'assistant', content: JSON.stringify({ reply: h.text }) });
      const heavy = text.length > 140 || /מייל|תנסח|לנסח|השווה|השוואה|קורות|התאמ|למה|תסביר|ניתוח|מכתב|תכין/.test(text);
      const r = await answer(system(text), [...base, { role: 'user', content: text }], heavy, true, ui);
      const j = r.j || extractJSON(r.text);
      const p = { text: r.text };
      const reply = (j && typeof j.reply === 'string' && j.reply.trim()) ? j.reply.trim() : (p.text || '').trim();
      const cards = [];
      if (/(התקשר|דיברתי|שיחה|קבענו|זימנו|הזמינו|ראיון|דחו|דחייה|לא התקבלתי|הצעה|הגשתי|שלחתי|עדכן|תעדכן|תוסיף|תסמן|תמחק|לא רלוונטי|נסגרה)/.test(text))
        (Array.isArray(j?.actions) ? j.actions : []).map(validate).filter(Boolean).slice(0, 4).forEach(a => cards.push(actionCard(a)));
      if (j?.email && (j.email.body || j.email.subject) && /מייל|אימייל|מכתב|לנסח|תנסח|טיוטה|פולואפ|email/i.test(text)) cards.push(emailCard(j.email));
      if (typeof j?.remember === 'string' && j.remember && /תזכור|זכור|תשמור/.test(text)) { await addPref(j.remember); cards.push(el('span', { class: 'ja-meta', text: 'נשמר בזיכרון: ' + j.remember })); }
      ui.done(reply, r.meta, cards);
      history.push({ role: 'user', text }, { role: 'assistant', text: reply }); history = history.slice(-20); store.set('ja.history', history);
    } catch (e) { ui.fail(errText(e)); }
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
    if (opened) { if (!PHONE()) q.focus({ preventScroll: true }); loadData(); }
  }
  fab.addEventListener('click', () => toggle());
  close.addEventListener('click', () => toggle(false));
  gear.addEventListener('click', () => showSettings(settings.hidden));
  clear.addEventListener('click', () => { history = []; store.set('ja.history', []); practice = null; pEnd.disabled = true; welcome(); });
  tChat.addEventListener('click', () => setMode('chat')); tPrac.addEventListener('click', () => setMode('practice'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && opened) toggle(false); });

  welcome();
  prefs = store.get('ja.prefs', []);
  setStatus('on', 'Gemini');
  window.dash.onData(() => { loadData(); if (mode === 'practice') fillJobs(); });
})();
