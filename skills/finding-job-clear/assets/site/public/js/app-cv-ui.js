/* The "קובץ קורות חיים למשרה" button in the CV card: one Gemini call (plus at most one fix-up call) through
   /api/private/gen, the checks in app-cv-file.js, a review of only the changed lines, then PDF (print view → "Save as PDF")
   or Word (.docx built here). After a download, a Word copy is kept in Drive (folder "קורות חיים שנשלחו") and linked to
   the application, so you always know which version went to which company. */
(() => {
  const go = document.getElementById('cv-go'), st = document.getElementById('cv-status'), box = document.getElementById('cv-review');
  const F = window.CVFile;
  if (!go || !box || !F || !window.JT) return;
  const ME = window.SITE.ME;
  // the contact line: phone, email, LinkedIn, GitHub, site (a phone / LinkedIn / GitHub link in the CV text wins)
  const OWNER = { phone: '{{PHONE}}', github: '{{GITHUB_URL}}', site: '{{SITE_URL}}', linkedin: '' };
  const contactOf = (text) => F.contactLine(text, { email: ME.email, phone: ME.phone || OWNER.phone, github: ME.github || OWNER.github, site: ME.site || OWNER.site, linkedin: ME.linkedin || OWNER.linkedin });
  const SEC = { headline: 'כותרת', summary: 'תקציר', skills: 'כישורים', projects: 'פרויקטים', experience: 'ניסיון', education: 'השכלה' };
  const el = (tag, attrs = {}, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); } e.append(...kids.filter((x) => x != null)); return e; };
  const gen = (prompt, o = {}) => window.SITE.api('/api/private/gen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, system: o.system || '', json: !!o.json, max_tokens: o.maxTokens || 4096 }) }).then((j) => j.text || '');

  let cur = null;   // { res, lang, company, cvText }
  const nameFor = (lang) => (lang === 'he' ? ME.name : ME.name_en) || ME.name_en || ME.name;
  const docBlocks = () => F.blocks(cur.res.cv, { lang: cur.lang, name: nameFor(cur.lang), contact: contactOf(cur.cvText) });
  const fname = (ext) => F.fileName(ME.name_en || ME.name, cur.company, cur.lang, ext);

  go.addEventListener('click', async () => {
    if (go.disabled) return;
    const c = window.JT.cvContext ? window.JT.cvContext() : null;
    if (!c || !c.cv.text) { st.textContent = 'לא מצאתי קורות חיים בגיליון (הלשונית "קורות חיים").'; return; }
    // the file is always in the language of the CV text (translating would change every line)
    const wanted = c.cv.he ? 'he' : 'en', lang = F.isHebrewText(c.cv.text) ? 'he' : 'en';
    go.disabled = true; box.hidden = true; st.textContent = 'Gemini מתאים את קורות החיים למשרה…';
    try {
      const res = await F.tailor({ gen, cvText: c.cv.text, lang, job: c.job, ask: c.ask, name: ME.name_en || ME.name });
      cur = { res, lang, company: c.t ? c.t.company : '', role: c.t ? c.t.role : '', appId: c.t && /^a:/.test(c.t.key) ? c.t.key.slice(2) : '', cvText: c.cv.text, saved: '' };
      render(wanted !== lang);
      st.textContent = res.fallback ? 'Gemini לא החזיר תשובה שאפשר להשתמש בה. הקובץ הוא קורות החיים שלך כמו שהם, בסדר הקבוע.' : 'מוכן. עוברים על השינויים ומורידים.';
    } catch (e) { console.error('cv file', e); st.textContent = 'משהו השתבש בהכנת הקובץ. אפשר לנסות שוב.'; }
    finally { go.disabled = false; }
  });

  function render(langNote) {
    const { res } = cur;
    const n = res.changes.length;
    const kids = [el('h3', { class: 'jt-h', text: n ? `מה השתנה מול קורות החיים שלך (${n} ${n === 1 ? 'שורה' : 'שורות'})` : 'אף שורה לא השתנתה' }),
      el('p', { class: 'jt-note', text: 'כל שאר השורות הועתקו מקורות החיים שלך מילה במילה. אפשר לבטל שינוי לפני ההורדה.' })];
    if (langNote) kids.push(el('p', { class: 'jt-note', text: `אין בגיליון קורות חיים ב${cur.lang === 'he' ? 'אנגלית' : 'עברית'}, אז הקובץ ב${cur.lang === 'he' ? 'עברית' : 'אנגלית'}.` }));
    if (n) {
      const ol = el('ol', { class: 'jt-cv-changes' });
      let prevOld = '';
      res.changes.forEach((ch) => {
        // two summary sentences from the same original: the old text is shown once
        const showOld = ch.old && ch.old !== prevOld; prevOld = ch.old || '';
        const cb = el('input', { type: 'checkbox' }); cb.checked = true;
        const li = el('li', { 'data-key': ch.key },
          el('label', {}, cb, el('span', { text: SEC[ch.sec] || ch.sec })),
          showOld ? el('p', { class: 'jt-cv-old', dir: 'auto', text: ch.old }) : null,
          el('p', { class: 'jt-cv-new', dir: 'auto', text: ch.text }));
        cb.addEventListener('change', () => { (cb.checked ? F.redoChange : F.undoChange)(res.cv, ch.key); li.classList.toggle('is-off', !cb.checked); });
        ol.append(li);
      });
      kids.push(ol);
    }
    const list = (title, items) => { if (!items.length) return null; const d = el('details', {}, el('summary', { text: title })); d.append(el('ul', {}, ...items.map((t) => el('li', { dir: 'auto', text: t })))); return d; };
    kids.push(list(`הצעות של Gemini שנדחו בבדיקה (${res.rejected.length})`, res.rejected.map((r) => `${r.text}  ← ${(r.why || []).join('; ')}`)));
    const dropped = res.dropped.filter((d) => d.why !== 'duplicate');
    kids.push(list(`שורות שהושמטו כדי לעמוד בכללים ובעמוד אחד (${dropped.length})`, dropped.map((d) => d.text)));
    if (res.missing.length) kids.push(el('p', { class: 'jt-note', dir: 'auto', text: 'דרישות במשרה שלא מופיעות בקורות החיים (לא נוספו לקובץ): ' + res.missing.join(', ') }));
    kids.push(list('ביטויים בקורות החיים המקוריים שנשמעים כמו AI (כדאי לתקן בגיליון)', res.origFlags.map((f) => `${f.text.slice(0, 140)}  ← ${f.msgs.join('; ')}`)));
    if (!res.fits) kids.push(el('p', { class: 'jt-note', text: 'לתשומת לב: יכול להיות שהקובץ יוצא קצת יותר מעמוד אחד.' }));
    const pdf = el('button', { type: 'button', class: 'jt-primary', text: 'הורדה כ-PDF' });
    const word = el('button', { type: 'button', class: 'jt-secondary', text: 'הורדה כ-Word' });
    const note = el('p', { class: 'jt-note', role: 'status', text: 'PDF: נפתח חלון ההדפסה. ביעד בוחרים "שמירה כ-PDF" (Save as PDF) ושומרים. הטקסט נשאר טקסט, אז מערכות סינון קורות חיים (ATS) קוראות אותו.' });
    pdf.addEventListener('click', () => printPdf(note));
    word.addEventListener('click', () => downloadDocx(note));
    kids.push(el('div', { class: 'jt-cv-actions' }, pdf, word), note);
    box.replaceChildren(...kids.filter(Boolean));
    box.hidden = false;
  }

  function downloadDocx(note) {
    const name = fname('docx');
    const bytes = F.toDocx(docBlocks(), { lang: cur.lang, name: nameFor(cur.lang), title: name.replace(/\.docx$/, '') });
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }));
    const a = el('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    note.textContent = `ירד הקובץ ${name}.`;
    keepCopy(note);
  }

  // a Word copy of exactly what was downloaded goes to Drive, once per version (the same file twice is not saved again)
  async function keepCopy(note) {
    const name = fname('docx');
    const bytes = F.toDocx(docBlocks(), { lang: cur.lang, name: nameFor(cur.lang), title: name.replace(/\.docx$/, '') });
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    const b64 = btoa(bin);
    if (cur.saved === b64) return;
    try {
      const r = await window.SITE.api('/api/private/action', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_cv', file_name: name, b64, company: cur.company, role: cur.role, app_id: cur.appId }) });
      if (!r || !r.ok) throw new Error((r && r.error) || 'failed');
      cur.saved = b64;
      const a = el('a', { href: window.safeHref(r.url, 'https://drive.google.com/'), target: '_blank', rel: 'noopener noreferrer', text: 'פתיחה ב-Drive' });
      note.append(' ', r.app_id ? 'עותק נשמר ב-Drive וקושר להגשה. ' : 'עותק נשמר ב-Drive (עוד אין הגשה לחברה הזו, אז הוא לא קושר). ', a);
    } catch (e) { console.error('cv copy', e); note.append(' העותק ל-Drive לא נשמר הפעם.'); }
  }

  // PDF: a clean one-column page in a hidden same-origin frame, printed by the browser ("Save as PDF" keeps real text)
  let frame = null;
  const A4_PX = 297 * 96 / 25.4;
  const load = (html) => new Promise((resolve) => {
    if (!frame) { frame = el('iframe', { class: 'jt-cv-frame', title: 'קורות חיים להדפסה', 'aria-hidden': 'true', tabindex: '-1' }); document.body.append(frame); }
    frame.onload = () => resolve(frame.contentWindow);
    frame.srcdoc = html;
  });
  async function printPdf(note) {
    const base = fname('pdf').replace(/\.pdf$/, ''), bl = docBlocks();
    let w = await load(F.printHtml(bl, { lang: cur.lang, title: base }));
    const tall = () => (w.document.querySelector('.page') || w.document.body).scrollHeight > A4_PX + 1;
    if (tall()) w = await load(F.printHtml(bl, { lang: cur.lang, title: base, fontPt: 10, padMm: [11, 14] }));
    note.textContent = (tall() ? 'לתשומת לב: יוצא יותר מעמוד אחד. ' : '') + 'בחלון ההדפסה: יעד "שמירה כ-PDF" (Save as PDF), ואז שמירה בשם ' + base + '.pdf';
    // the save dialog suggests the page title as the file name
    const old = document.title; document.title = base;
    try { (F.print || ((win) => win.print()))(w); } finally { setTimeout(() => { document.title = old; }, 1500); }
    keepCopy(note);
  }
})();
