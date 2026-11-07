// Local stand-in for the Apps Script Web App + Gemini REST, for `wrangler dev` tests only.
// Data is generated (fake companies and addresses), shaped like the real Sheet tabs.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const TOKEN = 'test-token';
const LOG = path.join(os.tmpdir(), 'mock-actions.log');
fs.rmSync(LOG, { force: true });

const day = (base, n) => { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10);
const COS = ['Nexora', 'Bluefin Data', 'Kodkod Labs', 'Amitim AI', 'Vertex Robotics', 'Shaked Systems', 'Orbit QA', 'Pixel Harbor', 'Tamar Analytics', 'Gefen Cloud',
  'Lumen Security', 'Ofek Health', 'Rimon Fintech', 'Nova Mobility', 'Zohar Media', 'Cedar Insights', 'Arbel Tech', 'Helix Bio', 'Maor Energy', 'Sapir Logistics'];
const ROLES = ['Junior Data Analyst', 'AI Engineer Student', 'Python Developer (Junior)', 'QA Automation Intern', 'Machine Learning Intern', 'סטודנט/ית לתפקיד דאטה', 'מפתח/ת Python ג׳וניור', 'Junior Backend Developer'];
const CHANNELS = ['LinkedIn', 'אתר החברה', 'AllJobs', 'דרושים', 'מייל ישיר', 'הפניה'];
const STATUSES = ['הוגש', 'הוגש', 'הוגש', 'הוגש', 'בתהליך', 'ראיון', 'נדחה', 'נדחה', 'הוגש', 'בתהליך'];
const LEVELS = ['סטודנט', "בוגר/ג'וניור", 'התמחות'];

const applications = Array.from({ length: 40 }, (_, i) => {
  const company = COS[i % COS.length] + (i >= 20 ? ' ' + ['Group', 'Ltd'][i % 2] : '');
  const applied = day('2026-07-27', Math.floor(i * 2.4));
  const status = STATUSES[i % STATUSES.length];
  const he = /[֐-׿]/.test(ROLES[i % ROLES.length]) || i % 3 === 0;
  return {
    id: 'app-' + String(i + 1).padStart(2, '0'), company, role: ROLES[i % ROLES.length], job_id: i % 4 === 0 ? String(4100 + i) : '',
    channel: CHANNELS[i % CHANNELS.length], applied, status, last_update: status === 'הוגש' ? applied : day(applied, 6 + (i % 9)),
    next_step: status === 'ראיון' ? 'ראיון טכני ביום ראשון' : status === 'בתהליך' ? 'מטלת בית' : status === 'נדחה' ? '' : 'ממתין לתגובה',
    note: i % 7 === 0 ? 'משרה היברידית' : '', link: `https://mail.google.com/mail/u/0/#inbox/thread-f:${1800000000000000000n + BigInt(i)}`, thread_id: 't' + (1000 + i),
    level: LEVELS[i % LEVELS.length], origin: he ? 'ישראלית' : 'בינלאומית', cv_version: he ? 'עברית v3' : 'English v2',
    followup_after: status === 'הוגש' || status === 'בתהליך' ? day(applied, 10) : '', followup_draft: i === 5 ? 'https://mail.google.com/mail/#drafts' : '', followup_sent: '',
    direct_contact: [3, 8, 13, 18, 33].includes(i) ? `jobs@${COS[i % COS.length].toLowerCase().replace(/\s+/g, '')}.example` : '', direct_contact_note: i === 13 ? 'בפורמט: שם מלא; 3 סיבות למה אתה מתאים' : '',
    relevant: i === 39 ? 'FALSE' : 'TRUE',
  };
});
// deliberate duplicates for the data audit: one job through two channels, two rows on one mail link
Object.assign(applications[38], { company: applications[18].company, role: applications[18].role, channel: 'JobMaster' }); applications[18].channel = 'Hunter';
applications[37].link = applications[36].link;
const KINDS = ['הגשה', 'תגובה', 'פנייה', 'התקדמות', 'ראיון', 'דחייה'];
const STATES = ['לא נקרא — כדאי להיכנס', 'נקרא', 'נקרא — מחכה לתגובה שלך', 'שלחת תגובה', 'המטלה בוצעה', 'נקרא', 'נשלח ממך'];
const events = Array.from({ length: 64 }, (_, i) => {
  const a = applications[i % 40];
  const kind = i < 40 ? 'הגשה' : KINDS[1 + (i % 5)];
  const text = kind === 'הגשה' ? 'אישור קבלת מועמדות' : kind === 'דחייה' ? 'תודה על פנייתך, החלטנו להתקדם עם מועמדים אחרים' : kind === 'ראיון' ? 'נשמח לקבוע ראיון טכני' : kind === 'התקדמות' ? 'מצורפת מטלת בית, להגיש תוך שבוע' : 'אשמח לשיחה קצרה השבוע';
  return {
    id: 'ev-' + String(i + 1).padStart(2, '0'), date: i < 40 ? a.applied : day(a.applied, 5 + (i % 7)), company: a.company, role: a.role, kind, text, link: a.link,
    action: kind === 'התקדמות' || kind === 'פנייה' ? 'TRUE' : 'FALSE', mail_state: i < 40 ? 'נקרא' : STATES[i % STATES.length], thread_id: a.thread_id, msg_id: '',
  };
});
// a second submission event on one thread ("קורות חיים נשלחו" and "המועמדות התקבלה")
events[63] = { ...events[0], id: 'ev-64', text: 'אישור: המועמדות התקבלה', mail_state: 'נקרא' };
const prep = applications.filter((a) => ['בתהליך', 'ראיון'].includes(a.status)).slice(0, 1).map((a, i) => ({
  id: 'prep-' + (i + 1), app_id: a.id, company: a.company, role: a.role, created: a.last_update, stage: a.status === 'ראיון' ? 'ראיון טכני' : 'מטלת בית',
  about: `${a.company} בונה מוצרי דאטה ל-B2B. הצוות קטן ועובד ב-Python ו-SQL.`, questions: 'ספר על פרויקט ML שבנית|איך היית מנקה דאטה חסר?|למה דווקא אצלנו?', todo: 'לחזור על Pandas|להכין דוגמה מ-VISION|שאלה על הצוות', link: a.link, thread_id: a.thread_id,
}));
const FITS = ['מתאים מאוד', 'מתאים', 'אולי'];
const job_leads = Array.from({ length: 2 }, (_, i) => ({
  id: 'lead-' + (i + 1), company: ['Quanta AI', 'Dror Data', 'Yarden Labs', 'Peleg Systems', 'Brosh Cloud', 'Tavor Security', 'Hermon Bio', 'Alon Retail'][i], role: ROLES[(i + 2) % ROLES.length],
  seen: day(TODAY, -i), fit: FITS[i % 3], why: 'Python ו-ML כמו בפרויקטים שלך', origin: i % 2 ? 'בינלאומית' : 'ישראלית', location: ['תל אביב', 'הרצליה', 'היברידי', 'פתח תקווה'][i % 4],
  status: i === 7 ? 'לא אומתה' : 'פתוחה', about: 'חברת מוצר בצמיחה', role_desc: 'פיתוח מודלים וניתוח נתונים בצוות דאטה', link: 'https://example.com/jobs/' + (i + 1), mail_link: 'https://mail.google.com/mail/u/0/#inbox/lead' + i, source: 'LinkedIn Alerts',
}));
const mails = Array.from({ length: 20 }, (_, i) => ({
  date: day(TODAY, -i), company: i < 13 ? applications[i * 3].company : 'Fresh Co ' + i, subject: ['עדכון לגבי מועמדותך', 'Interview invitation', 'מטלת בית', 'Application received'][i % 4],
  kind: ['תגובה', 'ראיון', 'מטלה', 'אישור', 'דחייה', 'נצפה', 'אחר'][i % 7], direction: i === 2 ? 'יוצא' : 'נכנס', thread_id: i < 13 ? applications[i * 3].thread_id : 'tnew' + i, link: 'https://mail.google.com/mail/u/0/#inbox/m' + i,
}));
const jobs = Array.from({ length: 6 }, (_, i) => ({ seen: day(TODAY, -i), fit: FITS[i % 3], company: 'Alert Co ' + (i + 1), title: ROLES[i % ROLES.length], location: 'תל אביב', link: 'https://example.com/alert/' + (i + 1) }));
const data = () => ({
  ok: true, applications, events, prep, job_leads, mails, jobs, status: { last_run: TODAY + ' 09:00' },
  cv: { text_en: '{{NAME_EN}} — AI Engineer student, Practical Engineer in Electronics. Python, SQL, scikit-learn. Projects: VISION (CNN, 74.5%), loan approval (SVC, FastAPI).', text_he: '{{NAME_HE}} — סטודנט להנדסת AI, הנדסאי אלקטרוניקה. Python, SQL, scikit-learn.' },
  live: { unread: ['t1001', 't1003'], sent: [{ thread_id: 'zz-fu-1', date: day(applications[8].applied, 12) + 'T10:00:00', to: [applications[8].direct_contact] }, { thread_id: 't1044', date: TODAY + 'T08:00:00', to: ['x@example.com'] }] },
  at: new Date().toISOString(),
});

const vec = (t) => { const v = new Array(16).fill(0); for (const ch of String(t)) v[ch.charCodeAt(0) % 16] += 1; return v; };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const reply = (res, text) => send(res, 200, { candidates: [{ content: { parts: [{ text }] } }] });
http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/exec' && req.method === 'GET') {
      if (u.searchParams.get('token') !== TOKEN) return send(res, 200, { ok: false, error: 'unauthorized' });
      return send(res, 200, data());
    }
    if (u.pathname === '/exec' && req.method === 'POST') {
      const j = JSON.parse(b || '{}'); fs.appendFileSync(LOG, JSON.stringify(j) + '\n');
      if (j.token !== TOKEN) return send(res, 200, { ok: false, error: 'unauthorized' });
      if (j.action === 'data') return send(res, 200, data());   // reads come by POST (the token stays out of URLs)
      if (j.action === 'create_draft') return send(res, 200, { ok: true, draft_id: 'd1', url: 'https://mail.google.com/mail/#drafts' });
      return send(res, 200, { ok: true });
    }
    if (u.pathname === '/__log') return send(res, 200, fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []);
    if (u.pathname.endsWith(':batchEmbedContents')) { const j = JSON.parse(b); return send(res, 200, { embeddings: j.requests.map((r) => ({ values: vec(r.content.parts[0].text) })) }); }
    if (u.pathname.endsWith(':generateContent')) {
      const j = JSON.parse(b); const sys = j.systemInstruction?.parts?.[0]?.text || ''; const last = j.contents.at(-1).parts[0].text;
      fs.appendFileSync(LOG, JSON.stringify({ gemini: true, sys: sys.slice(0, 60), turns: j.contents.length }) + '\n');
      if (j.generationConfig?.responseMimeType === 'application/json') {
        if (/מייל הגשת מועמדות/.test(sys)) return reply(res, JSON.stringify({ subject: 'מועמדות למשרת Junior Data Analyst – {{NAME_HE}}', body: 'שלום,\nאני מגיש מועמדות למשרה. בניתי מודל CNN שמזהה רגשות (74.5%) ומערכת חיזוי הלוואות ב-FastAPI.\nקורות החיים מצורפים.\n\n{{NAME_HE}} | {{EMAIL}}' }));
        if (/דיברתי/.test(last)) return reply(res, JSON.stringify({ reply: 'עדכנתי הצעה: לסמן שהיה ראיון טלפוני. התקשרו מ-050-1234567.', actions: [{ type: 'update_application', id: 'app-01', status: 'בתהליך', note: 'שיחה טלפונית' }, { type: 'send_email', to: 'x' }], email: null, remember: null }));
        if (/מייל|פולואפ/.test(last)) return reply(res, JSON.stringify({ reply: 'הנה טיוטה.', actions: [], email: { to: 'jobs@nexora.example', subject: 'פולואפ על ההגשה', body: 'שלום,\nרציתי לבדוק את מצב ההגשה שלי. תודה, {{FIRST_NAME_HE}}' }, remember: null }));
        return reply(res, JSON.stringify({ reply: 'השבוע מחכות לך 2 תגובות ו-3 פולואפים.', actions: [], email: null, remember: null }));
      }
      if (/interviewer|מראיין/.test(sys)) return reply(res, /סיכום|summary/.test(last) ? 'חוזקות: 1. … ציון: 7/10' : 'שאלה ראשונה: ספר על פרויקט שבנית ב-Python ומה היה הקושי הכי גדול.');
      if (/לשפר את קורות החיים/.test(sys)) return reply(res, '1. מה כבר מתאים: Python, SQL ופרויקט VISION.\n2. להדגיש: פריסה ב-FastAPI.\n3. במקום: "Developed a system" עדיף: "Built and deployed an SVC model with FastAPI".\n4. תקציר: …');
      return reply(res, '{{FIRST_NAME_HE}} הוא סטודנט להנדסת AI שבנה פרויקטים ב-Python.');
    }
    send(res, 404, { error: 'nf' });
  });
}).listen(Number(process.env.MOCK_PORT) || 8788, '127.0.0.1', () => console.log('mock on ' + (Number(process.env.MOCK_PORT) || 8788)));
