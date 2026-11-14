(() => {
  const el = (t, a = {}, ...k) => { const e = document.createElement(t); for (const [x, v] of Object.entries(a)) { if (x === 'class') e.className = v; else if (x === 'text') e.textContent = v; else e.setAttribute(x, v); } k.flat().forEach((c) => c != null && e.append(c)); return e; };
  const card = el('section', { class: 'jt-card jt-feed', id: 'feed', 'aria-label': 'עדכונים אוטומטיים מ-Gmail' });
  const status = el('span', { class: 'jt-note', text: 'טוען את העדכונים האוטומטיים…' });
  const mailsBox = el('div'), jobsBox = el('div');
  card.append(el('div', { class: 'jt-feed-head' }, el('h2', { class: 'jt-h', text: 'עדכונים אוטומטיים מ-Gmail' }), status),
    el('p', { class: 'jt-note', text: 'נאסף כל שעה על ידי סקריפט ב-Google, בלי Claude. מסומן "חדש" מה שעוד לא נכנס לדשבורד. הוא ייכנס לבד בריצה הבאה של הסקריפט.' }), mailsBox, jobsBox);
  const anchor = document.querySelector('.jt section.jt-replies-card') || document.querySelector('.jt-cv') || document.querySelector('.jt-head');
  (anchor && anchor.parentNode ? anchor.parentNode.insertBefore(card, anchor) : document.querySelector('.jt')?.append(card));

  const KIND_CLASS = { 'דחייה': 'k-bad', 'הצעה': 'k-good', 'ראיון': 'k-good', 'מטלה': 'k-warn', 'נצפה': 'k-warn' };
  let mails = null, jobs = null, last = null, err = null;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9א-ת]/g, '');
  function rowsOf(payload) {
    const v = payload?.values || [];
    if (!v.length) return [];
    const [h, ...r] = v; return r.map((x) => Object.fromEntries(h.map((k, i) => [k, x[i] ?? ''])));
  }
  function render() {
    if (err) { status.textContent = err; return; }
    if (!mails && !jobs) return;
    status.textContent = last ? 'עודכן לאחרונה ' + last : '';
    const evs = (window.dash?.data('events').data) || [];
    const threads = new Set(evs.map((e) => e.thread_id).filter(Boolean));
    const archived = window.JT?.archivedThreads || new Set();
    const recent = (mails || []).filter((m) => m.kind !== 'אחר' && !archived.has(m.thread_id)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    mailsBox.replaceChildren();
    if (recent.length) {
      const ul = el('ul', { class: 'jt-feed-list' });
      recent.forEach((m) => {
        const isNew = !threads.has(m.thread_id);
        const link = el('a', { href: window.safeHref(m.link), target: '_blank', rel: 'noopener noreferrer', text: m.subject || '(בלי נושא)' });
        ul.append(el('li', {}, el('span', { class: 'jt-feed-kind ' + (KIND_CLASS[m.kind] || ''), text: m.kind }),
          el('div', { class: 'jt-feed-main' }, el('b', {}, link), el('small', { text: [m.company, m.date, m.direction === 'יוצא' ? 'נשלח ממך' : ''].filter(Boolean).join(' · ') })),
          isNew ? el('span', { class: 'jt-feed-new', text: 'חדש' }) : el('span')));
      });
      mailsBox.append(el('h3', { text: 'מיילים אחרונים על ההגשות' }), ul);
    } else mailsBox.append(el('p', { class: 'jt-note', text: 'אין מיילים חדשים על ההגשות בימים האחרונים.' }));
    const have = new Set(((window.dash?.data('job_leads').data) || []).map((l) => norm(l.company) + '|' + norm(l.role)));
    const apps = new Set(((window.dash?.data('applications').data) || []).map((a) => norm(a.company) + '|' + norm(a.role)));
    const fresh = (jobs || []).filter((j) => j.fit !== 'אולי' && !have.has(norm(j.company) + '|' + norm(j.title)) && !apps.has(norm(j.company) + '|' + norm(j.title)))
      .sort((a, b) => (a.fit === 'מתאים מאוד' ? 0 : 1) - (b.fit === 'מתאים מאוד' ? 0 : 1) || b.seen.localeCompare(a.seen)).slice(0, 10);
    jobsBox.replaceChildren();
    if (fresh.length) {
      const ul = el('ul', { class: 'jt-feed-list' });
      fresh.forEach((j) => ul.append(el('li', {}, el('span', { class: 'jt-feed-kind ' + (j.fit === 'מתאים מאוד' ? 'k-good' : ''), text: j.fit }),
        el('div', { class: 'jt-feed-main' }, el('b', {}, el('a', { href: window.safeHref(j.link), target: '_blank', rel: 'noopener noreferrer', text: j.title })), el('small', { text: [j.company, j.location, j.seen].filter(Boolean).join(' · ') })),
        el('span', { class: 'jt-feed-new', text: 'משרה חדשה' }))));
      jobsBox.append(el('h3', { text: 'משרות חדשות מההתראות (לפני הדירוג של Gemini)' }), ul);
    }
  }
  // site version: the hourly feed tabs (מיילים, משרות, סטטוס) arrive with /api/private/data
  window.dash?.onData(() => {
    const m = window.dash.data('mails'), j = window.dash.data('jobs');
    if (m.status === 'error') { err = 'לא הצלחתי לקרוא את העדכונים האוטומטיים.'; render(); return; }
    if (m.status !== 'ok') return;
    err = null; mails = m.data || []; jobs = j.data || [];
    const lr = window.dash.raw()?.status?.last_run; last = lr ? String(lr) : null;
    if (!mails.length && !jobs.length && !lr) err = 'עוד אין עדכונים אוטומטיים — הסקריפט ב-Google עדיין לא הופעל.';
    render();
  });
})();
