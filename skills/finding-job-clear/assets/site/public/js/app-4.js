  (() => {
    const { STATUS_ORDER, STATUS_CLASS, fmtDate } = window.JT;
    const table = document.querySelector('.jt-apps');
    const tbody = table.querySelector('tbody');
    const search = document.querySelector('.jt-app-search');
    const chips = document.querySelector('.jt-app-chips');
    let filter = 'הכל', sortKey = 'last_update', sortDir = -1;

    const cell = (tr, text, cls) => { const td = document.createElement('td'); if (cls) td.className = cls; td.textContent = text; tr.appendChild(td); return td; };
    const isArchived = (r) => r.relevant === false || String(r.relevant).toLowerCase() === 'false';
    const STATE_CLASS = { 'לא נקרא — כדאי להיכנס': 'jt-ms-unread', 'נקרא — מחכה לתגובה שלך': 'jt-ms-wait', 'נקרא': 'jt-ms-read', 'שלחת תגובה': 'jt-ms-replied', 'המטלה בוצעה': 'jt-ms-done', 'נשלח ממך': 'jt-ms-sent' };
    const stateCell = (tr, state) => {
      const td = document.createElement('td');
      if (state) { const p = document.createElement('span'); p.className = 'jt-pill ' + (STATE_CLASS[state] || 'jt-ms-read'); p.textContent = state; td.appendChild(p); }
      tr.appendChild(td); return td;
    };
    const liveState = () => {
      const m = dash.data('mail_live');
      const map = new Map();
      if (m.status === 'ok') (m.data || []).forEach((r) => map.set(r.id, r));
      return map;
    };
    const withLive = (rows) => { const map = liveState(); return rows.map((r) => (map.has(r.id) ? { ...r, mail_state: map.get(r.id).mail_state, action: map.get(r.id).action } : r)); };
    const POSITIVE = ['התקדמות', 'ראיון', 'הצעה', 'פנייה', 'תגובה'];
    const linkCell = (tr, text, href, hex) => {
      const td = document.createElement('td');
      if (href && /^https:\/\/mail\.google\.com\//.test(href)) {
        const a = document.createElement('a'); a.href = window.JT.mailHref(href, hex); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'jt-mail'; a.textContent = text; td.appendChild(a);
      } else td.textContent = text;
      tr.appendChild(td); return td;
    };

    const drawChips = (rows) => {
      chips.replaceChildren();
      // archived applications (45 days with no news, Lifecycle.gs) have their own chip and are left out of the rest
      const opts = ['הכל', ...STATUS_ORDER.filter((s) => rows.some((r) => r.status === s && !isArchived(r))), ...(rows.some(isArchived) ? ['ארכיון'] : [])];
      opts.forEach((s) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'jt-chip'; b.textContent = s;
        b.setAttribute('aria-pressed', String(s === filter));
        b.addEventListener('click', () => { filter = s; draw(); });
        chips.appendChild(b);
      });
    };

    const draw = () => {
      const d = dash.data('applications');
      tbody.replaceChildren();
      table.querySelectorAll('th').forEach((th) => {
        const k = th.dataset.field;
        th.setAttribute('aria-sort', k === sortKey ? (sortDir > 0 ? 'ascending' : 'descending') : 'none');
      });
      if (d.status !== 'ok') {
        const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 10;
        if (d.status === 'error') { const f = document.createElement('div'); f.className = 'jt-fail'; f.textContent = 'הטעינה נכשלה'; td.appendChild(f); }
        else { td.className = 'dash-skeleton'; td.textContent = ''; }
        tr.appendChild(td); tbody.appendChild(tr); return;
      }
      const all = d.data || [];
      drawChips(all);
      const q = search.value.trim().toLowerCase();
      const rows = all
        .filter((r) => (filter === 'ארכיון' ? isArchived(r) : !isArchived(r) && (filter === 'הכל' || r.status === filter)))
        .filter((r) => !q || `${r.company} ${r.role} ${r.job_id} ${r.channel} ${r.note}`.toLowerCase().includes(q))
        .sort((a, b) => {
          if (sortKey === 'status') return sortDir * (STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));
          return sortDir * String(a[sortKey] || '').localeCompare(String(b[sortKey] || ''), 'he');
        });
      if (!rows.length) {
        const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 10; td.className = 'jt-empty'; td.textContent = 'אין הגשות שמתאימות לסינון'; tr.appendChild(td); tbody.appendChild(tr); return;
      }
      rows.forEach((r) => {
        const tr = document.createElement('tr'); tr.dataset.key = r.id;
        const tdc = document.createElement('td'); tdc.className = 'jt-company';
        if (r.link) { const a = document.createElement('a'); a.href = /^https:\/\/mail\.google\.com\//.test(r.link) ? window.JT.mailHref(r.link, r.thread_id) : window.safeHref(r.link); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = r.company; tdc.appendChild(a); } else tdc.textContent = r.company;
        tr.appendChild(tdc);
        cell(tr, r.role);
        cell(tr, fmtDate(r.applied), 'jt-date');
        const tds = document.createElement('td'); const p = document.createElement('span'); p.className = 'jt-pill ' + (STATUS_CLASS[r.status] || ''); p.textContent = r.status; tds.appendChild(p); tr.appendChild(tds);
        cell(tr, fmtDate(r.last_update), 'jt-date');
        cell(tr, r.channel, 'jt-hide-sm');
        cell(tr, r.level, 'jt-hide-sm');
        cell(tr, r.cv_version, 'jt-hide-sm');
        cell(tr, r.next_step, 'jt-hide-sm');
        cell(tr, r.note, 'jt-hide-sm');
        tbody.appendChild(tr);
      });
    };

    table.querySelectorAll('th button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.sort;
      if (sortKey === k) sortDir = -sortDir; else { sortKey = k; sortDir = (k === 'applied' || k === 'last_update') ? -1 : 1; }
      draw();
    }));
    search.addEventListener('input', draw);
    dash.onData(draw);

    const fu = document.querySelector('.jt-followups');
    const fuBody = fu.querySelector('tbody');
    const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const fuMade = {};            // id -> viewUrl of a draft made in this session
    // a follow-up already sent from Gmail: same thread, or mail to the contact (or their company domain) after applying
    const fuSent = (r) => {
      const addr = String(r.direct_contact || '').toLowerCase(), dom = addr.split('@')[1] || '';
      const s = dash.data('gmail_sent'); if (s.status !== 'ok') return null;
      return (s.data || []).filter((m) => String(m.date).slice(0, 10) > String(r.applied || '0000') && ((r.thread_id && m.thread_id === r.thread_id) ||
        (addr && (m.to || []).some((x) => { x = String(x).toLowerCase(); return x === addr || (dom && !/gmail\.com$/.test(dom) && x.endsWith('@' + dom)); }))))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
    };
    const isHeb = (r) => r.origin === 'ישראלית' || /[\u0590-\u05ff]/.test(r.company || '');
    const fuDraft = (r) => {
      const d = r.applied ? r.applied.split('-') : null;
      const role = r.role && !/לא צוין/.test(r.role) ? r.role : '';
      const fmt = String(r.direct_contact_note || '').split(/(?:בפורמט|format)\s*:/i)[1];
      if (fmt && isHeb(r)) {   // the company asked for a specific structure — follow it, with blanks for what only you know
        const items = fmt.split(/;/).map((x) => x.trim()).filter(Boolean);
        const lines = items.map((x) => /שם מלא/.test(x) ? `${x}: {{NAME_HE}}, ${role}${r.job_id ? ', משרה ' + r.job_id : ''}` : /3 סיבות|סיבות/.test(x) ? `${x}:\n1. [ ]\n2. [ ]\n3. [ ]` : `${x}: [ ]`);
        return { subject: `${role || 'מועמדות'}${r.job_id ? ' (' + r.job_id + ')' : ''} – {{NAME_HE}}`, body: `שלום,\n\nלפי מה שביקשתם, הפרטים שלי:\n\n${lines.join('\n\n')}\n\nתודה,\n{{NAME_HE}}` };
      }
      if (isHeb(r)) {
        return { subject: `פולואפ: ${role || 'מועמדות'} – {{NAME_HE}}`, body: `שלום,\n\nהגשתי מועמדות${role ? ' למשרת ' + role : ''}${r.job_id ? ' (משרה ' + r.job_id + ')' : ''}${d ? ' ב-' + d[2] + '.' + d[1] + '.' + d[0] : ''} ורציתי לבדוק אם יש עדכון.\n[משפט אחד משלך: למה דווקא ${r.company}]\n{{FOLLOWUP_LINE_HE}} אשמח לשלוח פרטים נוספים או לתאם שיחה קצרה.\n\nתודה,\n{{NAME_HE}}` };
      }
      const M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      return { subject: `Follow-up: ${role || 'my application'} – {{NAME_EN}}`, body: `Hi,\n\nI applied for ${role ? 'the ' + role + ' position' : 'a position at ' + r.company}${r.job_id ? ' (job ' + r.job_id + ')' : ''}${d ? ' on ' + M[+d[1] - 1] + ' ' + (+d[2]) : ''} and wanted to check whether there is any update.\n[One line of your own: why ${r.company} specifically]\n{{FOLLOWUP_LINE_EN}} I'd be glad to send more details or set up a short call.\n\nThanks,\n{{NAME_EN}}` };
    };
    async function fuSaveDraftUrl(id, url) {
      await window.SITE.action({ action: 'update_application', id, followup_draft: url, next_step: 'טיוטת פולואפ מוכנה ב-Gmail — לעבור ולשלוח' });
      return true;
    }
    const fuAction = (td, r) => {
      // sent: from Gmail live, or recorded on the application by the hourly script (Lifecycle.gs)
      const sent = fuSent(r) || (r.followup_sent ? { thread_id: r.thread_id || '', date: r.followup_sent } : null);
      if (sent) { const a = document.createElement('a'); a.href = 'https://mail.google.com/mail/#all/' + sent.thread_id; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'jt-mail'; a.textContent = `✓ שלחת פולואפ ב-${fmtDate(String(sent.date).slice(0, 10))}`; const n = document.createElement('div'); n.className = 'jt-note'; n.textContent = 'ממתינים לתשובה'; td.append(a, n); return; }
      const url = r.followup_draft || fuMade[r.id];
      if (url) { const a = document.createElement('a'); a.href = window.safeHref(url, 'https://mail.google.com/mail/#drafts'); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'jt-mail jt-draft'; a.textContent = 'טיוטה מוכנה — לפתוח ב-Gmail'; td.appendChild(a); return; }
      if (!EMAIL_RE.test(r.direct_contact || '')) { td.textContent = r.next_step || 'ממתינים לתשובה'; td.classList.add('jt-muted'); return; }
      const b = document.createElement('button'); b.type = 'button'; b.className = 'jt-apply'; b.textContent = 'ליצור טיוטה';
      const st = document.createElement('div'); st.className = 'jt-note';
      b.addEventListener('click', async () => {
        if (b.disabled) return; b.disabled = true; b.textContent = 'יוצר טיוטה…'; st.textContent = '';
        try {
          const m = fuDraft(r);
          const p = await window.SITE.action({ action: 'create_draft', to: r.direct_contact, subject: m.subject, body: m.body });
          const url = window.safeHref(p.url, 'https://mail.google.com/mail/#drafts');
          fuMade[r.id] = url;
          let saved = false; try { saved = await fuSaveDraftUrl(r.id, url); } catch (e) { console.warn('save draft url', e); }
          td.replaceChildren(); fuAction(td, r);
          const n = document.createElement('div'); n.className = 'jt-note'; n.textContent = saved ? 'נשמרה ב-Gmail (לא נשלחה). להשלים את המשפט בסוגריים ולשלוח.' : 'נשמרה ב-Gmail (לא נשלחה). להשלים את המשפט בסוגריים ולשלוח.'; td.appendChild(n);
        } catch (e) {
          b.disabled = false; b.textContent = 'ליצור טיוטה';
          st.textContent = 'לא הצלחתי ליצור טיוטה. אפשר לנסות שוב.';
        }
      });
      td.append(b, st);
    };
    dash.onData(() => {
      const d = dash.data('applications');
      fuBody.replaceChildren();
      if (d.status !== 'ok') {
        const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 5;
        if (d.status === 'error') { const f = document.createElement('div'); f.className = 'jt-fail'; f.textContent = 'הטעינה נכשלה'; td.appendChild(f); } else td.className = 'dash-skeleton';
        tr.appendChild(td); fuBody.appendChild(tr); return;
      }
      const t = new Date();
      const today = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const open = (r) => r.status === 'הוגש' || r.status === 'בתהליך' || r.status === 'ראיון';
      // the same rule as Nika and the morning brief: a follow-up only where there is a direct email to write to
      const rows = (d.data || []).filter((r) => !isArchived(r) && open(r) && EMAIL_RE.test(String(r.direct_contact || '').trim()) && ((r.followup_after && r.followup_after <= today) || !r.followup_sent))
        .sort((a, b) => (b.followup_draft ? 2 : EMAIL_RE.test(b.direct_contact || '') ? 1 : 0) - (a.followup_draft ? 2 : EMAIL_RE.test(a.direct_contact || '') ? 1 : 0) || String(a.followup_after || '9').localeCompare(String(b.followup_after || '9')));
      if (!rows.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 5; td.className = 'jt-empty'; td.textContent = 'אין כרגע הגשות שמחכות לפולואפ או לפנייה ישירה'; tr.appendChild(td); fuBody.appendChild(tr); return; }
      rows.forEach((r) => {
        const tr = document.createElement('tr'); tr.dataset.key = r.id;
        linkCell(tr, r.company, r.link, r.thread_id).className = 'jt-company';
        cell(tr, r.role, 'jt-role');
        cell(tr, r.followup_after ? (r.followup_after <= today ? 'עכשיו' : fmtDate(r.followup_after)) : 'עכשיו', 'jt-date');
        const to = document.createElement('td');
        if (EMAIL_RE.test(r.direct_contact || '')) {
          const a = document.createElement('a'); a.href = window.JT.composeHref(r.direct_contact); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'jt-mail'; a.textContent = r.direct_contact; a.dir = 'ltr'; to.appendChild(a);
          if (r.direct_contact_note) { const n = document.createElement('div'); n.className = 'jt-note'; n.textContent = r.direct_contact_note; to.appendChild(n); }
        } else { to.textContent = r.direct_contact || '—'; to.classList.add('jt-muted'); }
        tr.appendChild(to);
        const act = document.createElement('td'); tr.appendChild(act); fuAction(act, r);
        if (!fuSent(r) && !r.followup_sent && (r.followup_draft || EMAIL_RE.test(r.direct_contact || ''))) tr.className = 'jt-needs';
        fuBody.appendChild(tr);
      });
    });

    const leads = document.querySelector('.jt-leads');
    const leadsBody = leads.querySelector('tbody');
    const leadChips = document.querySelector('.jt-lead-chips');
    const FIT_ORDER = ['מתאים מאוד', 'מתאים', 'אולי'];
    const FIT_CLASS = { 'מתאים מאוד': 'jt-st-offer', 'מתאים': 'jt-st-process', 'אולי': 'jt-st-submitted' };
    let leadFilter = 'הכל';
    const drawLeads = () => {
      const d = dash.data('job_leads');
      leadsBody.replaceChildren();
      if (d.status !== 'ok') {
        const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 7;
        if (d.status === 'error') { const f = document.createElement('div'); f.className = 'jt-fail'; f.textContent = 'הטעינה נכשלה'; td.appendChild(f); } else td.className = 'dash-skeleton';
        tr.appendChild(td); leadsBody.appendChild(tr); return;
      }
      const all = d.data || [];
      leadChips.replaceChildren();
      ['הכל', ...FIT_ORDER.filter((f) => all.some((r) => r.fit === f))].forEach((f) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'jt-chip';
        b.textContent = f === 'הכל' ? `הכל (${all.length})` : `${f} (${all.filter((r) => r.fit === f).length})`;
        b.setAttribute('aria-pressed', String(f === leadFilter));
        b.addEventListener('click', () => { leadFilter = f; drawLeads(); });
        leadChips.appendChild(b);
      });
      const rows = all.filter((r) => leadFilter === 'הכל' || r.fit === leadFilter)
        .sort((a, b) => (a.status === 'פתוחה' ? 0 : 1) - (b.status === 'פתוחה' ? 0 : 1) || FIT_ORDER.indexOf(a.fit) - FIT_ORDER.indexOf(b.fit) || String(b.seen).localeCompare(String(a.seen)));
      if (!rows.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 7; td.className = 'jt-empty'; td.textContent = 'אין כרגע משרות חדשות שמתאימות'; tr.appendChild(td); leadsBody.appendChild(tr); return; }
      rows.forEach((r) => {
        const tr = document.createElement('tr'); tr.dataset.key = r.id;
        linkCell(tr, r.company, r.mail_link).className = 'jt-company';
        const trl = document.createElement('td');
        if (/^https:\/\//.test(r.link)) { const a = document.createElement('a'); a.href = r.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.className = 'jt-mail jt-draft'; a.textContent = r.role; trl.appendChild(a); } else trl.textContent = r.role;
        tr.appendChild(trl);
        const tf = document.createElement('td'); const p = document.createElement('span'); p.className = 'jt-pill ' + (FIT_CLASS[r.fit] || ''); p.textContent = r.fit; tf.appendChild(p); tr.appendChild(tf);
        const td = document.createElement('td'); td.className = 'jt-desc';
        const a1 = document.createElement('div'); a1.className = 'jt-desc-role'; a1.textContent = r.role_desc || ''; td.appendChild(a1);
        if (r.about) { const a2 = document.createElement('div'); a2.className = 'jt-desc-about'; a2.textContent = r.about; td.appendChild(a2); }
        if (r.why) { const a3 = document.createElement('div'); a3.className = 'jt-desc-why'; a3.textContent = r.why; td.appendChild(a3); }
        tr.appendChild(td);
        cell(tr, r.location, 'jt-hide-sm');
        cell(tr, r.status, 'jt-hide-sm ' + (r.status === 'פתוחה' ? 'jt-k-progress' : 'jt-muted'));
        const ta = document.createElement('td'); const ab = document.createElement('button'); ab.type = 'button'; ab.className = 'jt-apply'; ab.textContent = 'הגש';
        ab.setAttribute('aria-label', `הגשת קורות חיים ל-${r.company}, ${r.role}`);
        ab.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); if (window.JT.apply) window.JT.apply('l:' + r.id); }); ta.appendChild(ab); tr.prepend(ta);
        leadsBody.appendChild(tr);
      });
    };
    dash.onData(drawLeads);

    const rep = document.querySelector('.jt-replies');
    const repBody = rep.querySelector('tbody');
    const repChips = document.querySelector('.jt-rep-chips');
    const repSearch = document.querySelector('.jt-rep-search');
    const STATE_ORDER = ['לא נקרא — כדאי להיכנס', 'נקרא — מחכה לתגובה שלך', 'המטלה בוצעה', 'שלחת תגובה', 'נקרא', 'נשלח ממך'];
    let repFilter = 'לא נקרא — כדאי להיכנס', repSort = 'mail_state', repDir = 1, repTouched = false;
    const norm = (x) => String(x || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9\u0590-\u05ff]+/g, ' ').trim();
    const channelOf = () => {
      const a = dash.data('applications');
      const byBoth = new Map(), byCo = new Map();
      if (a.status === 'ok') (a.data || []).forEach((r) => {
        byBoth.set(norm(r.company) + '|' + norm(r.role), r.channel);
        const k = norm(r.company); const prev = byCo.get(k);
        byCo.set(k, prev === undefined ? r.channel : (prev === r.channel ? prev : 'כמה ערוצים'));
      });
      const list = a.status === 'ok' ? (a.data || []) : [];
      return (e) => {
        const c = norm(e.company), r = norm(e.role);
        const exact = byBoth.get(c + '|' + r); if (exact) return exact;
        const part = r && list.find((x) => norm(x.company) === c && (norm(x.role).includes(r) || r.includes(norm(x.role))));
        return (part && part.channel) || byCo.get(c) || '';
      };
    };
    // ארכיון: שרשור שבו כתבו שהמשרה לא מתאימה / לא ממשיכים / "נעדכן כשתהיה משרה מתאימה", ורק אחרי שענית בו.
    const NOT_FIT = /לא\s*מתאימ|לא\s*רלוונטי|לא\s*נמצא(?:ת|ה)?\s*מתאים|מישהו\s*אחר|מועמד(?:ים)?\s*אחר|לא\s*להמשיך|לא\s*ממשיכים|לא\s*נמשיך|לא\s*להתקדם|לא\s*מתקדמ|ג['׳]וניור\s*מדי|מדי\s*למשרה|נעדכן\s*אות|נשמח\s*לעדכן|כשי(?:י)?מצאו|כשתהיה\s*משרה|משרות\s*מתאימות|מאגר\s*המועמדים|not\s+(?:a\s+)?(?:good\s+)?fit|other\s+candidates|not\s+moving\s+forward|future\s+(?:opportunit|opening|role)/i;
    const isNotFit = (e) => e.kind === 'דחייה' || NOT_FIT.test(String(e.text || ''));
    const laterId = (a, b) => (a.length === b.length ? a > b : a.length > b.length);
    const after = (m, n) => (String(m.date) > String(n.date)) || (String(m.date) === String(n.date) && m.msg_id && n.msg_id && laterId(String(m.msg_id), String(n.msg_id)));
    // conversations of applications the hourly script archived (45 days with no news) go to the archive too
    const archivedKeys = () => {
      const a = dash.data('applications'), keys = new Set();
      if (a.status === 'ok') (a.data || []).filter(isArchived).forEach((r) => { if (r.thread_id) keys.add(String(r.thread_id)); keys.add('co:' + norm(r.company) + '|' + norm(r.role)); });
      return keys;
    };
    const archiveSplit = (rows) => {
      const groups = new Map();
      rows.forEach((r) => { const k = r.thread_id || ('co:' + norm(r.company) + '|' + norm(r.role)); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
      const out = new Set(), threads = new Set(), quiet = archivedKeys();
      groups.forEach((g, k) => {
        const mine = (r) => r.mail_state === 'נשלח ממך';
        const neg = g.filter((r) => !mine(r) && isNotFit(r));
        const hit = quiet.has(k) || neg.some((n) => {
          const answered = n.mail_state === 'שלחת תגובה' || g.some((m) => mine(m) && after(m, n));
          const reopened = g.some((m) => !mine(m) && !isNotFit(m) && m.kind !== 'הגשה' && after(m, n)); // אם אחרי זה הגיעה התקדמות — לא בארכיון
          return answered && !reopened;
        });
        if (hit) { g.forEach((r) => out.add(r.id)); if (!k.startsWith('co:')) threads.add(k); }
      });
      return { ids: out, threads };
    };
    const arch = document.querySelector('.jt-arch'), archBody = arch.querySelector('tbody'), archCount = document.querySelector('.jt-arch-count');
    const drawArchive = (rows) => {
      archBody.replaceChildren();
      const n = new Set(rows.map((r) => r.thread_id || r.company)).size;
      archCount.textContent = n ? (n === 1 ? '(שיחה אחת)' : '(' + n + ' שיחות)') : '';
      if (!rows.length) { const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 6; td.className = 'jt-empty'; td.textContent = 'עוד אין שיחות בארכיון'; tr.appendChild(td); archBody.appendChild(tr); return; }
      rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).forEach((r) => {
        const tr = document.createElement('tr'); tr.dataset.key = r.id;
        cell(tr, fmtDate(r.date), 'jt-date');
        cell(tr, r.company, 'jt-company');
        cell(tr, r.role, 'jt-hide-sm jt-role');
        cell(tr, r.kind, r.kind === 'דחייה' ? 'jt-k-reject' : '');
        linkCell(tr, r.text, r.link, r.thread_id);
        stateCell(tr, r.mail_state);
        archBody.appendChild(tr);
      });
    };
    window.JT.archivedThreads = new Set();
    const drawReplies = () => {
      const d = dash.data('events');
      repBody.replaceChildren();
      rep.querySelectorAll('th').forEach((th) => th.setAttribute('aria-sort', th.dataset.field === repSort ? (repDir > 0 ? 'ascending' : 'descending') : 'none'));
      if (d.status !== 'ok') {
        const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 7;
        if (d.status === 'error') { const f = document.createElement('div'); f.className = 'jt-fail'; f.textContent = 'הטעינה נכשלה'; td.appendChild(f); } else td.className = 'dash-skeleton';
        tr.appendChild(td); repBody.appendChild(tr); return;
      }
      const chOf = channelOf();
      const everything = withLive(d.data || []).map((r) => ({ ...r, channel: chOf(r) }));
      const split = archiveSplit(everything);
      window.JT.archivedThreads = split.threads;
      drawArchive(everything.filter((r) => split.ids.has(r.id)));
      const all = everything.filter((r) => !split.ids.has(r.id));
      const counts = new Map();
      all.forEach((r) => counts.set(r.mail_state, (counts.get(r.mail_state) || 0) + 1));
      if (!repTouched && !counts.get(repFilter)) repFilter = 'הכל';
      repChips.replaceChildren();
      ['הכל', ...STATE_ORDER.filter((s) => counts.get(s))].forEach((s) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'jt-chip';
        b.textContent = s === 'הכל' ? `הכל (${all.length})` : `${s} (${counts.get(s)})`;
        b.setAttribute('aria-pressed', String(s === repFilter));
        b.addEventListener('click', () => { repFilter = s; repTouched = true; drawReplies(); });
        repChips.appendChild(b);
      });
      const q = repSearch.value.trim().toLowerCase();
      const rank = (s) => { const i = STATE_ORDER.indexOf(s); return i < 0 ? 99 : i; };
      const rows = all
        .filter((r) => repFilter === 'הכל' || r.mail_state === repFilter)
        .filter((r) => !q || `${r.company} ${r.role} ${r.text} ${r.kind} ${r.channel}`.toLowerCase().includes(q))
        .sort((a, b) => {
          if (repSort === 'mail_state') return repDir * (rank(a.mail_state) - rank(b.mail_state)) || String(b.date).localeCompare(String(a.date));
          if (repSort === 'date') return repDir * String(a.date).localeCompare(String(b.date));
          return repDir * String(a[repSort] || '').localeCompare(String(b[repSort] || ''), 'he') || String(b.date).localeCompare(String(a.date));
        });
      if (!rows.length) {
        const tr = document.createElement('tr'); const td = document.createElement('td'); td.colSpan = 7; td.className = 'jt-empty'; td.textContent = 'אין מיילים במצב הזה'; tr.appendChild(td); repBody.appendChild(tr); return;
      }
      rows.forEach((r) => {
        const tr = document.createElement('tr'); tr.dataset.key = r.id;
        if (r.action === true || r.mail_state === 'נקרא — מחכה לתגובה שלך') tr.className = 'jt-needs';
        cell(tr, fmtDate(r.date), 'jt-date');
        cell(tr, r.company, 'jt-company');
        cell(tr, r.role, 'jt-hide-sm jt-role');
        cell(tr, r.kind, r.kind === 'דחייה' ? 'jt-k-reject' : POSITIVE.includes(r.kind) ? 'jt-k-progress' : '');
        linkCell(tr, r.text, r.link, r.thread_id);
        stateCell(tr, r.mail_state);
        cell(tr, r.channel, 'jt-channel');
        repBody.appendChild(tr);
      });
    };
    rep.querySelectorAll('th button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.sort;
      if (repSort === k) repDir = -repDir; else { repSort = k; repDir = k === 'date' ? -1 : 1; }
      drawReplies();
    }));
    repSearch.addEventListener('input', drawReplies);
    document.querySelector('.jt-refresh').addEventListener('click', () => { dash.refresh('gmail_unread'); dash.refresh('gmail_sent'); });
    const liveText = document.querySelector('.jt-live-text'), liveDot = document.querySelector('.jt-live-dot');
    dash.onData(() => {
      const u = dash.data('gmail_unread'), sn = dash.data('gmail_sent');
      if (u.status === 'ok' && sn.status === 'ok') { liveDot.dataset.on = (u.refreshing || sn.refreshing) ? 'busy' : 'ok'; liveText.textContent = (u.refreshing || sn.refreshing) ? 'בודק מול Gmail…' : 'מעודכן מול Gmail'; }
      else if (u.status === 'loading' || sn.status === 'loading') { liveDot.dataset.on = 'busy'; liveText.textContent = 'בודק מול Gmail…'; }
      else if (u.status === 'connect' || sn.status === 'connect') { liveDot.dataset.on = 'off'; liveText.textContent = 'צריך לחבר את Gmail כדי לראות מצב חי'; }
      else { liveDot.dataset.on = 'off'; liveText.textContent = 'לא הצלחתי לבדוק מול Gmail — מוצג המצב מהסריקה האחרונה'; }
    });
    dash.onData(drawReplies);
  })();
