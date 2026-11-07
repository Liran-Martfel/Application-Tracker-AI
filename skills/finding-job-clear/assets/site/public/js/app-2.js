  const STATUS_ORDER = ['הוגש', 'בתהליך', 'ראיון', 'הצעה', 'נדחה'];
  const STATUS_CLASS = { 'הוגש': 'jt-st-submitted', 'בתהליך': 'jt-st-process', 'ראיון': 'jt-st-interview', 'הצעה': 'jt-st-offer', 'נדחה': 'jt-st-rejected' };
  const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const threadHex = (url, hex) => {
    if (hex && /^[0-9a-f]{8,20}$/.test(hex)) return hex;
    const m = String(url || '').match(/thread-f:(\d+)/);
    if (m) { try { return BigInt(m[1]).toString(16); } catch (e) { return ''; } }
    return '';
  };
  const IS_PHONE = /iPhone|iPod|Android.+Mobile/.test(navigator.userAgent);
  const mailHref = (url, hex) => {
    if (!IS_PHONE) return url;
    const h = threadHex(url, hex);
    if (!h) return url;
    const acct = (String(url).match(/authuser=([^&#]+)/) || [])[1] || '{{EMAIL_URLENCODED}}';
    return `https://mail.google.com/mail/mu/mp/?authuser=${acct}#cv/Inbox/${h}`;
  };
  const composeHref = (to) => (IS_IOS ? 'mailto:' + encodeURIComponent(to) : 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(to));
  window.JT = { C: ['var(--jt-c0)', 'var(--jt-c1)', 'var(--jt-c2)', 'var(--jt-c3)', 'var(--jt-c4)'], STATUS_ORDER, STATUS_CLASS, mailHref, composeHref, IS_IOS };


  const gmailRows = async ({ answer, call, args }) => {
    const parse = (a) => {
      if (a == null) return {};
      if (typeof a === 'string') { try { return JSON.parse(a); } catch (e) { throw new Error(a.slice(0, 200)); } }
      if (Array.isArray(a.content) && a.content[0] && typeof a.content[0].text === 'string') return parse(a.content[0].text);
      return a;
    };
    let page = parse(answer);
    if (page.error) throw new Error(String(page.error.message || page.error));
    const rows = [];
    let guard = 0;
    while (true) {
      (page.threads || []).forEach((t) => (t.messages || []).forEach((m) => {
        const labels = m.labelIds || [];
        rows.push({ msg_id: m.id, thread_id: m.threadId || t.id, date: m.date || '', unread: labels.includes('UNREAD'), sent: labels.includes('SENT') });
      }));
      if (!page.nextPageToken || guard >= 3) break;
      guard += 1;
      page = parse(await call('search_threads', { ...args, pageToken: page.nextPageToken }));
    }
    return { columns: ['msg_id', 'thread_id', 'date', 'unread', 'sent'], rows, cut: !!page.nextPageToken };
  };
  dash.loader('gmail_unread', { description: 'הופך את תשובת Gmail לשורה לכל הודעה: מזהה, שרשור, תאריך, האם לא נקראה והאם נשלחה ממך.', fn: gmailRows });
  dash.loader('gmail_sent', { description: 'הופך את תשובת Gmail לשורה לכל הודעה: מזהה, שרשור, תאריך, האם לא נקראה והאם נשלחה ממך.', fn: gmailRows });

  dash.calc('mail_live', {
    title: 'מצב המיילים עכשיו',
    description: 'מצב כל מייל לפי Gmail ברגע הפתיחה: לא נקרא, נקרא, מחכה לתגובה, או שלחת תגובה באותו שרשור.',
    inputs: ['events', 'gmail_unread', 'gmail_sent'],
    fn: (events, gmail_unread, gmail_sent) => {
      const unreadMsgs = new Set(gmail_unread.filter((m) => m.unread).map((m) => m.msg_id));
      const unreadThreads = new Set(gmail_unread.filter((m) => m.unread).map((m) => m.thread_id));
      const sent = gmail_sent.filter((m) => m.sent);
      const later = (a, b) => (a.length === b.length ? a > b : a.length > b.length);
      return events.map((e) => {
        let s = e.mail_state;
        const fixed = s === 'המטלה בוצעה' || s === 'נשלח ממך';
        if (!fixed && e.thread_id) {
          // the site's live feed has thread ids and dates only (no message ids), so compare by time there
          const replied = sent.some((m) => m.thread_id === e.thread_id && (e.msg_id && m.msg_id ? later(m.msg_id, e.msg_id) : String(m.date).replace('T', ' ').slice(0, String(e.date).length) > String(e.date)));
          const isUnread = e.msg_id && unreadMsgs.size ? unreadMsgs.has(e.msg_id) : unreadThreads.has(e.thread_id);
          if (replied) s = 'שלחת תגובה';
          else if (isUnread) s = 'לא נקרא — כדאי להיכנס';
          else if (s === 'לא נקרא — כדאי להיכנס') s = e.action === true ? 'נקרא — מחכה לתגובה שלך' : 'נקרא';
        }
        return { id: e.id, mail_state: s, action: s === 'שלחת תגובה' ? false : e.action === true };
      });
    },
  });

  dash.calc('kpis_old', {
    title: 'מדדים מרכזיים',
    description: 'ספירת הגשות לפי סטטוס, ואחוז ההגשות שקיבלו תשובה (כל סטטוס שאינו ״הוגש״).',
    inputs: ['applications'],
    fn: (applications) => {
      const n = (s) => applications.filter((a) => a.status === s).length;
      const total = applications.length;
      const waiting = n('הוגש');
      const in_process = n('בתהליך') + n('ראיון') + n('הצעה');
      const rejected = n('נדחה');
      return [{ total, waiting, in_process, rejected, active: waiting + in_process, response_pct: total ? Math.round(((total - waiting) / total) * 100) : 0 }];
    },
  });

  dash.calc('kpis', {
    title: 'מדדים מרכזיים',
    description: 'הגשות פתוחות, שיעור מענה, הגשות השבוע, מיילים שמחכים לתגובה שלך ופולואפים שהגיע זמנם.',
    inputs: ['applications', 'mail_live'],
    fn: (applications, mail_live) => {
      const n = (s) => applications.filter((a) => a.status === s).length;
      const total = applications.length, waiting = n('הוגש'), in_process = n('בתהליך') + n('ראיון') + n('הצעה');
      const t = new Date(), ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const today = ymd(t), sunday = ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay()));
      const waiting_me = mail_live.filter((m) => m.action === true || m.mail_state === 'לא נקרא — כדאי להיכנס' || m.mail_state === 'נקרא — מחכה לתגובה שלך').length;
      const followups_due = applications.filter((a) => a.relevant !== false && ['הוגש', 'בתהליך', 'ראיון'].includes(a.status) && a.followup_after && a.followup_after <= today && !a.followup_draft).length;
      return [{ total, active: waiting + in_process, in_process, waiting, rejected: n('נדחה'), week: applications.filter((a) => String(a.applied) >= sunday).length,
        waiting_me, followups_due, response_pct: total ? Math.round(((total - waiting) / total) * 100) : 0 }];
    },
  });

  dash.calc('by_status', {
    title: 'הגשות לפי סטטוס',
    description: 'מספר ההגשות בכל סטטוס.',
    inputs: ['applications'],
    fn: (applications) => {
      const order = ['הוגש', 'בתהליך', 'ראיון', 'הצעה', 'נדחה'];
      return order.map((status) => ({ status, n: applications.filter((a) => a.status === status).length }));
    },
  });

  dash.calc('by_company', {
    title: 'הגשות לפי חברה',
    description: 'מספר המשרות שהוגשו לכל חברה, וכמה מהן עדיין פתוחות.',
    inputs: ['applications'],
    fn: (applications) => {
      const m = new Map();
      applications.forEach((a) => {
        const r = m.get(a.company) || { company: a.company, n: 0, open: 0 };
        r.n += 1;
        if (a.status !== 'נדחה') r.open += 1;
        m.set(a.company, r);
      });
      return [...m.values()].sort((x, y) => y.n - x.n || x.company.localeCompare(y.company));
    },
  });

  dash.calc('by_channel', {
    title: 'הגשות לפי ערוץ',
    description: 'מספר ההגשות בכל ערוץ, וכמה מהן קיבלו תשובה (סטטוס שאינו ״הוגש״).',
    inputs: ['applications'],
    fn: (applications) => {
      const m = new Map();
      applications.forEach((a) => {
        const r = m.get(a.channel) || { channel: a.channel, n: 0, answered: 0 };
        r.n += 1;
        if (a.status !== 'הוגש') r.answered += 1;
        m.set(a.channel, r);
      });
      return [...m.values()].sort((x, y) => y.n - x.n);
    },
  });

  const answeredBy = (applications, key) => {
    const m = new Map();
    applications.forEach((a) => {
      const k = a[key] || 'לא ידוע';
      const r = m.get(k) || { group: k, n: 0, answered: 0 };
      r.n += 1;
      if (a.status !== 'הוגש') r.answered += 1;
      m.set(k, r);
    });
    return [...m.values()].map((r) => ({ ...r, answered_pct: Math.round((r.answered / r.n) * 100) })).sort((x, y) => y.n - x.n);
  };
  window.JT.answeredBy = answeredBy;

  dash.calc('by_level', {
    title: 'תגובה לפי רמת משרה',
    description: 'לכל רמת משרה: כמה הוגשו, כמה קיבלו תשובה (סטטוס שאינו ״הוגש״) ובאיזה אחוז.',
    inputs: ['applications'],
    fn: (applications) => {
      const m = new Map();
      applications.forEach((a) => { const k = a.level || 'לא ידוע'; const r = m.get(k) || { group: k, n: 0, answered: 0 }; r.n += 1; if (a.status !== 'הוגש') r.answered += 1; m.set(k, r); });
      return [...m.values()].map((r) => ({ ...r, answered_pct: Math.round((r.answered / r.n) * 100) })).sort((x, y) => y.n - x.n);
    },
  });

  dash.calc('by_cv', {
    title: 'תגובה לפי גרסת קו״ח',
    description: 'לכל גרסת קורות חיים שנשלחה: כמה הוגשו, כמה קיבלו תשובה ובאיזה אחוז.',
    inputs: ['applications'],
    fn: (applications) => {
      const m = new Map();
      applications.forEach((a) => { const k = a.cv_version || 'לא ידוע'; const r = m.get(k) || { group: k, n: 0, answered: 0 }; r.n += 1; if (a.status !== 'הוגש') r.answered += 1; m.set(k, r); });
      return [...m.values()].map((r) => ({ ...r, answered_pct: Math.round((r.answered / r.n) * 100) })).sort((x, y) => y.n - x.n);
    },
  });

  dash.calc('by_origin', {
    title: 'תגובה לפי סוג חברה',
    description: 'חברות ישראליות מול בינלאומיות: כמה הוגשו, כמה קיבלו תשובה ובאיזה אחוז.',
    inputs: ['applications'],
    fn: (applications) => {
      const m = new Map();
      applications.forEach((a) => { const k = a.origin || 'לא ידוע'; const r = m.get(k) || { group: k, n: 0, answered: 0 }; r.n += 1; if (a.status !== 'הוגש') r.answered += 1; m.set(k, r); });
      return [...m.values()].map((r) => ({ ...r, answered_pct: Math.round((r.answered / r.n) * 100) })).sort((x, y) => y.n - x.n);
    },
  });

  dash.calc('response_time', {
    title: 'זמן עד תשובה',
    description: 'ממוצע הימים בין תאריך ההגשה לעדכון האחרון, בהגשות שקיבלו תשובה (סטטוס שאינו ״הוגש״).',
    inputs: ['applications'],
    fn: (applications) => {
      const days = applications.filter((a) => a.status !== 'הוגש' && a.applied && a.last_update)
        .map((a) => (new Date(a.last_update + 'T00:00:00Z') - new Date(a.applied + 'T00:00:00Z')) / 86400000);
      return [{ n: days.length, avg_days: days.length ? Math.round((days.reduce((x, y) => x + y, 0) / days.length) * 10) / 10 : 0 }];
    },
  });

  dash.calc('weekly', {
    title: 'הגשות לפי שבוע',
    description: 'מספר ההגשות בכל שבוע (ראשון עד שבת), כולל שבועות בלי הגשות.',
    inputs: ['applications'],
    fn: (applications) => {
      const weekOf = (s) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d; };
      if (!applications.length) return [];
      const counts = new Map();
      applications.forEach((a) => { const k = weekOf(a.applied).toISOString().slice(0, 10); counts.set(k, (counts.get(k) || 0) + 1); });
      const keys = [...counts.keys()].sort();
      const out = [];
      const d = new Date(keys[0] + 'T00:00:00Z');
      const end = new Date(keys[keys.length - 1] + 'T00:00:00Z');
      while (d <= end) { const k = d.toISOString().slice(0, 10); out.push({ week: k, n: counts.get(k) || 0 }); d.setUTCDate(d.getUTCDate() + 7); }
      return out;
    },
  });
