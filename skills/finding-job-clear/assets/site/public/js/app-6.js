(() => {
  // last run of the hourly Google script, the load-error banner, and the read-only data audit
  const lastRun = document.getElementById('last-run'), banner = document.getElementById('load-error'), retry = document.getElementById('retry');
  dash.onData(() => {
    const raw = dash.raw(), lr = raw?.status?.last_run;
    lastRun.textContent = lr ? 'הסקריפט ב-Google עדכן את הגיליון לאחרונה: ' + String(lr).replace(/^(d{4})-(d{2})-(d{2})/, '$3.$2.$1') : '';
    banner.hidden = dash.data('applications').status !== 'error';
  });
  retry.addEventListener('click', async () => { retry.disabled = true; retry.textContent = 'טוען…'; await dash.refresh(); retry.disabled = false; retry.textContent = 'נסה שוב'; });

  const box = document.getElementById('audit-body'); let loaded = false;
  const el = (t, text) => { const e = document.createElement(t); if (text != null) e.textContent = text; return e; };
  const group = (title, note, list, line) => {
    const g = el('div'); g.className = 'jt-audit-group';
    g.append(el('h3', `${title} (${list.length})`), Object.assign(el('p', note), { className: 'jt-note' }));
    if (!list.length) { g.append(Object.assign(el('p', 'לא נמצא.'), { className: 'jt-note' })); return g; }
    const ul = el('ul'); list.forEach((x) => { const li = el('li'); li.append(...line(x)); ul.append(li); }); g.append(ul); return g;
  };
  const items = (x, f) => x.items.map(f).join(' | ');
  async function load() {
    box.replaceChildren(Object.assign(el('p', 'בודק…'), { className: 'jt-note' }));
    try {
      const a = await window.SITE.api('/api/private/audit');
      box.replaceChildren(
        Object.assign(el('p', `נבדקו ${a.checked.applications} הגשות ו-${a.checked.events} אירועים.`), { className: 'jt-note' }),
        group('אירועים כפולים', 'אותו שרשור עם יותר מאירוע "הגשה" אחד, או אותו מייל פעמיים.', a.events, (x) => [el('b', x.items[0]?.company || ''), ' — ' + items(x, (e) => `${e.date} ${e.kind}: ${e.text} [${e.id}]`)]),
        group('הגשות כפולות', 'אותה חברה עם תפקיד דומה, למשל מאותה משרה דרך שני ערוצים.', a.applications, (x) => [el('b', x.company), ' — ' + items(x, (r) => `${r.role} · ${r.channel || '?'} · ${r.applied || '?'} · ${r.status} [${r.id}]`)]),
        group('כמה הגשות על אותו מייל', 'כמה שורות בגיליון שמצביעות לאותו קישור Gmail.', a.links, (x) => [items(x, (r) => `${r.company} – ${r.role} [${r.id}]`)]),
      );
      loaded = true;
    } catch (e) {
      const b = Object.assign(el('button', 'נסה שוב'), { type: 'button', className: 'jt-secondary' }); b.addEventListener('click', load);
      box.replaceChildren(Object.assign(el('p', 'הבדיקה לא הצליחה כרגע.'), { className: 'jt-note' }), b);
    }
  }
  // ---- who visited the public page ----
  const SEC = { top: 'ראש הדף', chat: 'הצ\'אט', projects: 'פרויקטים', experience: 'ניסיון', skills: 'כישורים', end: 'סוף הדף' };
  const CLK = { 'email-gmail': 'מייל דרך Gmail', 'email-app': 'מייל באפליקציה', 'email-copy': 'העתיקו את המייל', 'cv-he': 'קורות חיים בעברית', 'cv-en': 'קורות חיים באנגלית', whatsapp: 'וואטסאפ', github: 'GitHub', 'lang-he': 'עברו לעברית', 'lang-en': 'עברו לאנגלית', chip: 'שאלה מוכנה בצ\'אט' };
  const clk = (w) => CLK[w] || String(w).replace(/^project:/, 'פרויקט: ');
  const mmss = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  const when = (t) => new Date(t).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const note = (t) => Object.assign(el('p', t), { className: 'jt-note' });
  const vbody = document.getElementById('vis-body'), vrange = document.getElementById('vis-range');
  let vdays = 30, vmsg = '';
  const bars = (title, rows, label) => {
    const c = el('div'); c.append(el('h3', title));
    if (!rows.length) { c.append(note('עוד אין נתונים')); return c; }
    const max = Math.max(1, ...rows.map((r) => r[1])), wrap = el('div'); wrap.className = 'jt-bars'; wrap.style.minHeight = '0';
    rows.forEach(([k, v]) => {
      const r = el('div'); r.className = 'jt-bar';
      const l = el('div', label(k)); l.className = 'jt-bar-label'; l.title = label(k);
      const t = el('div'); t.className = 'jt-bar-track'; const f = el('div'); f.className = 'jt-bar-fill'; f.style.width = (v / max * 100) + '%'; f.style.background = 'var(--jt-c0)'; t.append(f);
      const n = el('div'); n.className = 'jt-bar-val'; n.append(el('b', String(v)));
      r.append(l, t, n); wrap.append(r);
    });
    c.append(wrap); return c;
  };
  // first press arms the button for 4 seconds, the second press does it
  function confirmTwice(btn, ask, run) {
    if (btn.dataset.armed) { delete btn.dataset.armed; clearTimeout(btn._t); btn.disabled = true; run(); return; }
    btn.dataset.armed = '1'; btn._label = btn._label || btn.textContent; btn.textContent = ask;
    btn._t = setTimeout(() => { delete btn.dataset.armed; btn.textContent = btn._label; }, 4000);
  }
  async function forget(body) {
    try {
      const r = await window.SITE.api('/api/private/stats/forget', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      vmsg = `נמחקו ${r.visits} ביקורים${r.questions ? ` ו-${r.questions} שאלות` : ''}.`;
    } catch { vmsg = 'המחיקה לא הצליחה. אפשר לנסות שוב.'; }
    loadVisitors();
  }
  async function loadVisitors() {
    vrange.replaceChildren(...[7, 30, 90].map((d) => { const b = el('button', d + ' ימים'); b.type = 'button'; b.className = 'jt-chip'; b.setAttribute('aria-pressed', String(d === vdays)); b.addEventListener('click', () => { vdays = d; loadVisitors(); }); return b; }));
    try {
      const v = await window.SITE.api('/api/private/stats?days=' + vdays);
      if (!v.visits && vmsg) { const m = el('p', vmsg); m.className = 'jt-done'; m.setAttribute('role', 'status'); vmsg = ''; vbody.replaceChildren(m); return; }
      if (!v.visits) { vbody.replaceChildren(Object.assign(el('p', `עוד אין ביקורים ב-${vdays} הימים האחרונים. כשמישהו ייכנס לאתר, תראה כאן כמה זמן נשאר, עד לאן גלל, על מה לחץ ומה שאל.`), { className: 'jt-empty' })); return; }
      const tile = (label, value, sub) => { const t = el('div'); t.className = 'jt-vis-tile'; t.append(Object.assign(el('span', label), { className: 'jt-note' }), el('b', value)); if (sub) t.append(Object.assign(el('span', sub), { className: 'jt-note' })); return t; };
      const tiles = el('div'); tiles.className = 'jt-vis-tiles';
      tiles.append(tile('ביקורים', String(v.visits)), tile('מבקרים שונים', String(v.visitors)), tile('זמן ממוצע באתר', mmss(v.avg_seconds), 'דקות'), tile('יצאו תוך 10 שניות', String(v.quick_exits)),
        tile('הורידו קורות חיים', String(v.clicks.filter(([k]) => k.startsWith('cv-')).reduce((a, [, n]) => a + n, 0))), tile('שאלות בצ\'אט', String(v.questions.length)));
      const grid = el('div'); grid.className = 'jt-vis-grid';
      grid.append(bars('עד לאן הגיעו', v.sections, (k) => SEC[k] || k), bars('גלילה בעמוד', v.depth.map(([d, n]) => [d + '%', n]), (k) => 'לפחות ' + k), bars('על מה לחצו', v.clicks.slice(0, 10), clk),
        bars('מאיפה הגיעו', v.referrers, (k) => k), bars('מדינה', v.countries, (k) => k), bars('מכשיר', v.devices, (k) => k));
      const qs = el('div'); qs.style.marginTop = 'var(--cds-gap-md)'; qs.append(el('h3', 'מה שאלו בצ\'אט'));
      if (!v.questions.length) qs.append(note('עוד לא שאלו.'));
      else { const ul = el('ul'); ul.className = 'jt-vis-q'; v.questions.forEach((q) => { const li = el('li', q.q); li.dir = 'auto'; li.append(el('small', when(q.at))); ul.append(li); }); qs.append(ul); }
      const recent = el('div'); recent.style.marginTop = 'var(--cds-gap-md)'; recent.append(el('h3', 'ביקורים אחרונים'));
      const tw = el('div'); tw.className = 'jt-tablewrap jt-short'; const tb = el('table'); tb.className = 'jt-table';
      const hr = el('tr'); ['מתי', 'זמן', 'גלילה', 'הגיעו עד', 'לחצו', 'שאלות', 'מאיפה', ''].forEach((h) => hr.append(el('th', h)));
      const thead = el('thead'); thead.append(hr); const tbody = el('tbody');
      v.recent.forEach((r) => {
        const tr = el('tr');
        [when(r.at), mmss(r.seconds), r.depth + '%', r.sections.map((x) => SEC[x] || x).join(', '), r.clicks.map(clk).join(', ') || '—', String(r.questions || 0), [r.ref, r.country, r.device, r.mine ? 'המכשיר הזה' : ''].filter(Boolean).join(' · ')]
          .forEach((x, i) => { const td = el('td', x); if (i === 0) td.className = 'jt-date'; tr.append(td); });
        // a visit of mine (from another network, say): two presses remove it, so one slip deletes nothing
        const td = el('td'); const del = Object.assign(el('button', 'זה אני'), { type: 'button', className: 'jt-chip jt-forget' });
        del.addEventListener('click', () => confirmTwice(del, 'למחוק?', () => forget({ ids: [r.id] })));
        td.append(del); tr.append(td);
        if (r.mine) tr.classList.add('jt-mine');
        tbody.append(tr);
      });
      tb.append(thead, tbody); tw.append(tb); recent.append(tw);
      // every visit from this device this month, in one go
      const mineBar = el('div'); mineBar.className = 'jt-mine-bar';
      if (vmsg) { const m = el('p', vmsg); m.className = 'jt-done'; m.setAttribute('role', 'status'); mineBar.append(m); vmsg = ''; }
      if (v.mine) {
        const all = Object.assign(el('button', `למחוק את ${v.mine} הביקורים שלי מהמכשיר הזה`), { type: 'button', className: 'jt-secondary' });
        all.addEventListener('click', () => confirmTwice(all, `בטוח? ללחוץ שוב כדי למחוק ${v.mine} ביקורים`, () => forget({ mine: true })));
        mineBar.append(all);
      }
      mineBar.append(note('ביקורים שהגיעו מהמכשיר שלך מסומנים "המכשיר הזה". ביקור שלך מרשת אחרת אפשר למחוק עם "זה אני" ליד השורה.'));
      vbody.replaceChildren(tiles, mineBar, grid, qs, recent);
    } catch (e) {
      const b = Object.assign(el('button', 'נסה שוב'), { type: 'button', className: 'jt-secondary' }); b.addEventListener('click', loadVisitors);
      vbody.replaceChildren(note('לא הצלחתי לטעון את נתוני הביקורים.'), b);
    }
  }
  loadVisitors();

  document.getElementById('audit-details').addEventListener('toggle', (e) => { if (e.target.open && !loaded) load(); });
})();
