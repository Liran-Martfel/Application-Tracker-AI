  (() => {
    const SKILL = 'finding-job-clear';
    const sel = document.getElementById('cv-target'), lang = document.getElementById('cv-lang'), ask = document.getElementById('cv-ask');
    const go = document.getElementById('cv-go'), out = document.getElementById('cv-out'), st = document.getElementById('cv-status');
    let targets = [];
    const fill = () => {
      const L = dash.data('job_leads'), A = dash.data('applications');
      const leads = L.status === 'ok' ? (L.data || []).filter((r) => !/לא אומתה/.test(r.status || '')) : [];
      const apps = A.status === 'ok' ? (A.data || []).filter((r) => r.status !== 'נדחה') : [];
      const prev = sel.value;
      targets = [
        ...apps.map((r) => ({ key: 'a:' + r.id, group: 'הגשות פתוחות', company: r.company, role: r.role, job_id: r.job_id || '', link: r.link || '', desc: r.next_step || '', origin: r.origin || '', contact: r.direct_contact || '' })),
        ...leads.map((r) => ({ key: 'l:' + r.id, group: 'משרות שכדאי להגיש', company: r.company, role: r.role, job_id: '', link: r.link || '', desc: r.role_desc || r.about || '', origin: r.origin || '' })),
      ];
      sel.replaceChildren(new Option('בלי משרה מסוימת — שיפור כללי', ''));
      ['משרות שכדאי להגיש', 'הגשות פתוחות'].forEach((g) => {
        const items = targets.filter((t) => t.group === g); if (!items.length) return;
        const og = document.createElement('optgroup'); og.label = g;
        items.forEach((t) => og.appendChild(new Option(`${t.company} — ${t.role}`, t.key)));
        sel.appendChild(og);
      });
      if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
    };
    dash.onData(fill);
    const head = (t) => {
      if (!t) return ['משרה: לא נבחרה — תשאל אותי לאיזו משרה'];
      const l = [`משרה: ${t.company} – ${t.role}${t.job_id ? ` (מס' ${t.job_id})` : ''}`];
      if (t.link) l.push(`קישור: ${t.link}`);
      if (t.desc) l.push(`על התפקיד: ${t.desc}`);
      if (t.origin) l.push(`סוג חברה: ${t.origin}`);
      return l;
    };
    // ---- site version: Gemini (through /api/private/gen) writes the suggestions and the email; the draft goes to Gmail via create_draft ----
    const outActions = document.getElementById('cv-out-actions'), cvCopy = document.getElementById('cv-copy');
    const RULES = 'כללים: אל תמציא שום עובדה, מספר, טכנולוגיה, תאריך, תואר או ניסיון שלא מופיעים בקורות החיים. כתוב בשפה אנושית וטבעית, בלי קלישאות (passionate, leverage, "בעל מוטיבציה גבוהה"), בלי אימוג\'ים ובלי מספרי טלפון.';
    const cvFor = (t) => {
      const cv = dash.raw()?.cv || {};
      const he = lang.value === 'עברית' || (lang.value === 'לפי המשרה' && (!t || t.origin === 'ישראלית' || /[֐-׿]/.test(t.company + ' ' + t.role)));
      return { he, text: String((he ? cv.text_he || cv.text_en : cv.text_en || cv.text_he) || '').trim() };
    };
    const target = (t) => t ? head(t) : ['משרת יעד: אין — שיפור כללי לתפקידים שאני מחפש (AI Solutions Engineer, AI Application Developer, Solutions Architect / Junior Solutions Engineer, Integration Engineer ו-AI Product Manager, ואחריהם ג׳וניור ב-AI, דאטה ו-Python)'];
    const parseJSON = (s) => { try { return JSON.parse(s); } catch {} const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch {} } return null; };
    const copyText = async (text, btn, area) => {
      let ok = false;
      try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); ok = true; } } catch (e) { ok = false; }
      if (!ok && area) {
        try { area.focus({ preventScroll: true }); area.select(); area.setSelectionRange(0, area.value.length); ok = document.execCommand('copy'); } catch (e) { ok = false; }
      }
      btn.textContent = ok ? 'הועתק ✓' : 'סמן והעתק מהתיבה';
      if (!ok && area) { area.focus({ preventScroll: true }); area.select(); }
      return ok;
    };
    cvCopy.addEventListener('click', () => copyText(out.value, cvCopy, out));

    go.addEventListener('click', async () => {
      if (go.disabled) return;
      const t = targets.find((x) => x.key === sel.value), cv = cvFor(t);
      if (!cv.text) { st.textContent = 'לא מצאתי קורות חיים בגיליון (הלשונית "קורות חיים").'; return; }
      go.disabled = true; st.textContent = 'Gemini כותב הצעות שיפור…';
      try {
        const prompt = [...target(t), `מה אני רוצה: ${ask.value.trim() || 'התאמה למשרה וניסוח חד יותר'}`, `שפת קורות החיים: ${cv.he ? 'עברית' : 'English'}`, '', 'קורות החיים שלי:', cv.text.slice(0, 12000)].join('\n');
        const text = await window.SITE.gen(prompt, { system: `אתה עוזר ל${window.SITE.ME.name} לשפר את קורות החיים שלו למשרה. ${RULES}
ההסברים בעברית, והניסוחים המוצעים עצמם בשפת קורות החיים. מבנה התשובה:
1. מה כבר מתאים למשרה
2. מה להדגיש או להעלות למעלה
3. ניסוחים מוצעים: "במקום: …" ואז "עדיף: …"
4. תקציר מקצועי מוצע, 2–3 שורות
אם המשרה דורשת משהו שלא מופיע בקורות החיים, כתוב שזה חסר ואל תוסיף אותו. טקסט רגיל בלי Markdown.` });
        out.hidden = false; out.value = text.trim(); outActions.hidden = false; cvCopy.textContent = 'העתקה';
        st.textContent = 'ההצעות מוכנות. קובץ קורות החיים עצמו לא השתנה.';
      } catch (e) { st.textContent = 'Gemini לא הצליח לענות כרגע. אפשר לנסות שוב.'; }
      finally { go.disabled = false; }
    });

    const EMAIL_OK = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const sheet = document.createElement('div'); sheet.className = 'jt-sheet'; sheet.hidden = true;
    sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'מייל הגשה');
    const sTitle = document.createElement('h3'); sTitle.className = 'jt-h';
    const sHint = document.createElement('p'); sHint.className = 'jt-note';
    sHint.textContent = 'Gemini כותב מייל הגשה קצר מתוך קורות החיים שלך. אפשר לערוך, ואז "טיוטה ב-Gmail" שומר אותו כטיוטה. לצרף את קובץ קורות החיים בטיוטה ב-Gmail. שום דבר לא נשלח מכאן.';
    const field = (label, node) => { const l = document.createElement('label'); l.className = 'jt-field'; const s = document.createElement('span'); s.textContent = label; l.append(s, node); return l; };
    const sTo = document.createElement('input'); sTo.className = 'jt-input'; sTo.type = 'email'; sTo.dir = 'ltr'; sTo.placeholder = 'כתובת (אם יש)';
    const sSubj = document.createElement('input'); sSubj.className = 'jt-input'; sSubj.type = 'text';
    const sText = document.createElement('textarea'); sText.className = 'jt-input'; sText.rows = 8; sText.setAttribute('aria-label', 'גוף המייל');
    const sStat = document.createElement('p'); sStat.className = 'jt-note'; sStat.setAttribute('role', 'status');
    const sActions = document.createElement('div'); sActions.className = 'jt-cv-actions';
    const sMake = document.createElement('button'); sMake.type = 'button'; sMake.className = 'jt-primary'; sMake.textContent = 'טיוטה ב-Gmail';
    const sCopy = document.createElement('button'); sCopy.type = 'button'; sCopy.className = 'jt-secondary'; sCopy.textContent = 'העתקה';
    const sClose = document.createElement('button'); sClose.type = 'button'; sClose.className = 'jt-secondary'; sClose.textContent = 'סגירה';
    sActions.append(sMake, sCopy, sClose);
    sheet.append(sTitle, sHint, field('נמען', sTo), field('נושא', sSubj), field('המייל', sText), sStat, sActions);
    document.querySelector('.jt').appendChild(sheet);
    const closeSheet = () => { sheet.hidden = true; };
    sCopy.addEventListener('click', () => copyText((sSubj.value ? sSubj.value + '\n\n' : '') + sText.value, sCopy, sText));
    sClose.addEventListener('click', closeSheet);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) closeSheet(); });
    sMake.addEventListener('click', async () => {
      const to = sTo.value.trim();
      if (to && !EMAIL_OK.test(to)) { sStat.textContent = 'הכתובת לא תקינה.'; return; }
      if (!sText.value.trim()) { sStat.textContent = 'המייל ריק.'; return; }
      sMake.disabled = true; sStat.textContent = 'שומר טיוטה ב-Gmail…';
      try {
        const p = await window.SITE.action({ action: 'create_draft', to, subject: sSubj.value.trim(), body: sText.value });
        sStat.replaceChildren('נשמרה ב-Gmail ולא נשלחה. לצרף את קובץ קורות החיים בטיוטה ב-Gmail ולשלוח בעצמך. ');
        const a = document.createElement('a'); a.href = window.safeHref(p.url, 'https://mail.google.com/mail/#drafts'); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'לפתיחת הטיוטות ↗'; sStat.append(a);
      } catch (e) { sStat.textContent = 'לא הצלחתי ליצור טיוטה. אפשר להעתיק ולהדביק ב-Gmail.'; sMake.disabled = false; }
    });
    let applySeq = 0;
    window.JT.apply = async (key) => {
      if ([...sel.options].some((o) => o.value === key)) sel.value = key;
      const t = targets.find((x) => x.key === sel.value), cv = cvFor(t), seq = ++applySeq;
      sTitle.textContent = t ? `הגשה ל-${t.company}` : 'הגשת קורות חיים';
      sTo.value = t?.contact || ''; sSubj.value = ''; sText.value = ''; sCopy.textContent = 'העתקה'; sMake.disabled = true;
      sheet.hidden = false;
      if (!cv.text) { sStat.textContent = 'לא מצאתי קורות חיים בגיליון (הלשונית "קורות חיים"). אפשר לכתוב את המייל כאן ידנית.'; sMake.disabled = false; return; }
      sStat.textContent = 'Gemini כותב מייל הגשה…';
      try {
        const prompt = [...target(t), ask.value.trim() ? `הערות שלי: ${ask.value.trim()}` : '', `שפת המייל: ${cv.he ? 'עברית' : 'English'}`, '', 'קורות החיים שלי:', cv.text.slice(0, 10000)].filter(Boolean).join('\n');
        const raw = await window.SITE.gen(prompt, { json: true, system: `כתוב מייל הגשת מועמדות קצר בשם ${window.SITE.ME.name} למשרה. ${RULES}
4–7 שורות: למה המשרה, 2 דברים אמיתיים מקורות החיים שמתאימים לה, ושקורות החיים מצורפים. תפקיד ומספר משרה בדיוק כמו שכתוב. עברית לחברה ישראלית, אנגלית לבינלאומית (לפי "שפת המייל").
חתימה: "${window.SITE.ME.name} | ${window.SITE.ME.email}" (באנגלית: "${window.SITE.ME.name_en} | ${window.SITE.ME.email}").
החזר JSON בלבד: {"subject":"…","body":"…"}` });
        if (seq !== applySeq) return;
        const j = parseJSON(raw) || { subject: '', body: raw };
        sSubj.value = String(j.subject || ''); sText.value = String(j.body || '').trim();
        sStat.textContent = 'אפשר לערוך לפני שיוצרים טיוטה.';
      } catch (e) { if (seq === applySeq) sStat.textContent = 'Gemini לא הצליח לכתוב כרגע. אפשר לנסות שוב או לכתוב ידנית.'; }
      finally { if (seq === applySeq) { sMake.disabled = false; sText.focus({ preventScroll: true }); } }
    };
    document.getElementById('cv-apply').addEventListener('click', () => window.JT.apply(sel.value));
  })();
