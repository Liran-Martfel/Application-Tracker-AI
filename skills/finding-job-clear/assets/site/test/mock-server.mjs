// Local stand-in for the Apps Script Web App + Gemini REST, for `wrangler dev` tests only.
// Data is generated (fake companies and addresses), shaped like the real Sheet tabs.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CODE_VERSION } from '../src/version.js';
let GS_VERSION = CODE_VERSION;   // what the fake Apps Script reports (/__gs_version?v= changes it)
const TOKEN = 'test-token';
// one log per mock port: two mocks running side by side never mix their logs
const LOG = path.join(os.tmpdir(), 'mock-actions-' + (Number(process.env.MOCK_PORT) || 8788) + '.log');
fs.rmSync(LOG, { force: true });
let TGLOG = [];   // what the site sent to the fake Telegram API (Nika)
// push tests: rows added on top of the generated data, and Nika's tasks in a fake Google Tasks
let EXTRA = { events: [], job_leads: [], interviews: [] }, TASK_N = 0;
const TASKS_DONE = new Set();

const day = (base, n) => { const d = new Date(base + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = new Date().toISOString().slice(0, 10);
const COS = ['Acme Robotics', 'Bluefin Data', 'Kodkod Labs', 'Amitim AI', 'Vertex Robotics', 'Shaked Systems', 'Orbit QA', 'Pixel Harbor', 'Tamar Analytics', 'Gefen Cloud',
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
  about: `${a.company} בונה מוצרי דאטה ל-B2B. הצוות קטן ועובד ב-Python ו-SQL.`, questions: 'ספר על פרויקט ML שבנית|איך היית מנקה דאטה חסר?|למה דווקא אצלנו?', todo: 'לחזור על Pandas|להכין דוגמה מ-ShelfScan|שאלה על הצוות', link: a.link, thread_id: a.thread_id,
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
// the "פרופיל" tab (Api.gs → profile): only rows with public TRUE may ever reach the public chat
const profile = [
  { key: 'תפקידי יעד', value: 'AI Solutions Engineer, Integration Engineer PUBLIC-PROFILE-ROW', public: true },
  { key: 'אזורים', value: 'Tel Aviv and the center', public: 'TRUE' },
  { key: 'כלל מיקום', value: 'SECRET-PRIVATE-ROW anywhere in the center', public: false },
  { key: 'שנות ניסיון חוסמות', value: 'SECRET-PRIVATE-ROW 2', public: 'FALSE' },
  { key: 'הערה', value: 'SECRET-PRIVATE-ROW not marked', public: '' },
  { key: 'פנייה', value: '{{FIRST_NAME_HE}} גבר, פני אליו בלשון זכר. MOCK-ADDR', public: false },
];
// the "קורות חיים" tab: one cell per language, pasted CV text (a generic stand-in)
const CV_EN = `AI Solutions Engineer
Data Science Student | B.A. in Economics
Alex Carmel | 050-1112233 | alex.carmel@example.com | Beer Sheva | GitHub: alex-carmel-demo

Professional Summary
Data Science Student and Economics graduate with 5 years of operations experience in logistics. Develops in Python, SQL and Machine Learning. Deeply passionate about data.

Technical Skills
• Languages: Python, SQL
• Libraries: NumPy, Pandas, Scikit-learn
• Tools: FastAPI, Streamlit, Excel, Tableau

Projects
Delivery Delay Prediction
• Developed a delivery delay prediction system based on a Random Forest model, deployed to a live website with FastAPI.
ShelfScan – Empty Shelf Detection
• Built a Python and OpenCV tool that finds missing products in shelf photos with 88.2% accuracy.

Experience
Operations Shift Lead (Bluegate Logistics), 2021 – 2025
• Led the evening shift of a 14-person warehouse team.
• Diagnosed and resolved software and hardware faults in the warehouse system in real time.
• Built an onboarding program for new pickers that cut ramp-up time from 3 weeks to 9 days.

Education
2024 – Present: Data Science & AI – Tech College
2016 – 2020: B.A. in Economics, graduated with honors`;
const CV_HE = `AI Solutions Engineer
לימודי מדעי הנתונים | תואר ראשון בכלכלה
אלכס כרמל | 050-1112233 | alex.carmel@example.com | באר שבע | GitHub: alex-carmel-demo

תקציר
תואר ראשון בכלכלה ולימודי מדעי הנתונים ו-AI, עם 5 שנות ניסיון בתפעול לוגיסטי. פיתוח ב-Python, SQL ו-Machine Learning. בעל מוטיבציה גבוהה.

כישורים
• שפות תכנות: Python, SQL
• ספריות: NumPy, Pandas, Scikit-learn
• כלים: FastAPI, Streamlit, Excel, Tableau

פרויקטים
חיזוי עיכובים במשלוחים
• פיתחתי מערכת לחיזוי עיכובים במשלוחים על בסיס מודל Random Forest, שפורסמה באתר חי עם FastAPI.
ShelfScan – זיהוי מדפים ריקים
• בניתי כלי ב-Python ו-OpenCV שמזהה מוצרים חסרים בתמונות מדפים בדיוק של 88.2%.

ניסיון
ראש משמרת תפעול (Bluegate Logistics), 2021 – 2025
• הובלתי משמרת ערב של צוות מחסן בן 14 אנשים.
• אבחון ותיקון תקלות תוכנה וחומרה במערכת המחסן בזמן אמת.
• בניתי תוכנית קליטה למלקטים חדשים שקיצרה את זמן הכניסה לתפקיד מ-3 שבועות ל-9 ימים.

השכלה
2024 – היום: מדעי הנתונים ו-AI – מכללה טכנולוגית
2016 – 2020: תואר ראשון בכלכלה, בהצטיינות`;
// fake Gemini for the tailored CV file (app-cv-file.js): the first answer has one AI-sounding line and one new fact,
// so the dashboard's checks send one fix-up call and throw the new fact away
function cvAnswer(prompt) {
  const ids = [...prompt.matchAll(/^(L\d+): (.*)$/gm)].map((m) => [m[1], m[2]]);
  const L = (start, text, changed = false) => { const e = ids.find(([, t]) => t.startsWith(start)); return { text: text || e[1], src: [e[0]], changed }; };
  if (/CV language: Hebrew/.test(prompt)) return {
    headline: L('AI Solutions'),
    summary: [{ text: 'תואר ראשון בכלכלה ולימודי מדעי הנתונים, עם פיתוח מערכות למידת מכונה ב-Python ו-SQL והעלאה שלהן לאוויר עם FastAPI.', src: [L('תואר ראשון בכלכלה ולימודי').src[0]], changed: true },
      { text: '5 שנות ניסיון בתפעול לוגיסטי, עם צוות מחסן ותקלות בזמן אמת.', src: [L('תואר ראשון בכלכלה ולימודי').src[0]], changed: true }],
    skills: [L('כלים: FastAPI', 'כלים: FastAPI, Streamlit, Tableau, Excel', true), L('שפות תכנות'), L('ספריות')],
    experience: [{ title: L('ראש משמרת תפעול'), bullets: [L('הובלתי משמרת'), L('אבחון ותיקון'), L('בניתי תוכנית', 'בניתי תוכנית קליטה חדשנית למלקטים חדשים שקיצרה את זמן הכניסה לתפקיד מ-3 שבועות ל-9 ימים.', true)] }],
    projects: [{ title: L('חיזוי עיכובים'), bullets: [L('פיתחתי מערכת', 'פיתחתי מערכת לחיזוי עיכובים במשלוחים על בסיס מודל Random Forest, שרצה ב-Docker באתר חי עם FastAPI.', true)] },
      { title: L('ShelfScan'), bullets: [L('בניתי כלי')] }],
    education: [{ title: L('2024 – היום'), bullets: [] }, { title: L('2016 – 2020'), bullets: [] }],
    missing: ['Docker', 'AWS'],
  };
  return {
    headline: L('AI Solutions'),
    summary: [{ text: 'Data Science Student and Economics graduate who builds Machine Learning systems in Python and SQL and ships them with FastAPI.', src: [L('Data Science Student and').src[0]], changed: true },
      { text: '5 years of operations experience in logistics, running a warehouse team and fixing faults in real time.', src: [L('Data Science Student and').src[0]], changed: true }],
    skills: [L('Tools:', 'Tools: FastAPI, Streamlit, Tableau, Excel', true), L('Languages:'), L('Libraries:')],
    experience: [{ title: L('Operations Shift'), bullets: [L('Led the evening'), L('Diagnosed'), L('Built an onboarding', 'Leveraged an onboarding program for new pickers to cut ramp-up time from 3 weeks to 9 days.', true)] }],
    projects: [{ title: L('Delivery Delay'), bullets: [L('Developed a delivery', 'Developed a delivery delay prediction system based on a Random Forest model, running in Docker on a live website.', true)] },
      { title: L('ShelfScan'), bullets: [L('Built a Python')] }],
    education: [{ title: L('2024 – Present'), bullets: [] }, { title: L('2016 – 2020'), bullets: [] }],
    missing: ['Docker', 'AWS'],
  };
}
const data = () => ({
  ok: true, applications, events: [...events, ...EXTRA.events], prep, job_leads: [...job_leads, ...EXTRA.job_leads], mails, jobs, profile, status: { last_run: TODAY + ' 09:00' }, interviews: EXTRA.interviews, code_version: GS_VERSION,
  cv: { text_en: CV_EN, text_he: CV_HE },
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
      if (j.action === 'add_task') return send(res, 200, /FAILTASK/.test(j.title || '') ? { ok: false, error: 'no list' } : { ok: true, task_id: 'task-' + ++TASK_N });
      if (j.action === 'save_cv') return send(res, 200, { ok: true, url: 'https://drive.google.com/file/d/mock-cv', app_id: j.app_id || '' });
      if (j.action === 'task_state') return send(res, 200, { ok: true, done: (j.ids || []).filter((id) => TASKS_DONE.has(id)) });
      return send(res, 200, { ok: true });
    }
    // fake Telegram Bot API: /tg/bot<token>/<method>
    // voice: getFile → the file itself → fake speech-to-text (Nika's STT_TEST_URL)
    if (u.pathname.startsWith('/tg/bot') && u.pathname.endsWith('/getFile')) { TGLOG.push({ method: 'getFile', body: JSON.parse(b || '{}') }); return send(res, 200, { ok: true, result: { file_path: 'voice/file_1.oga' } }); }
    if (u.pathname.startsWith('/tg/file/bot')) { res.writeHead(200, { 'Content-Type': 'audio/ogg' }); return res.end(Buffer.from('OggS fake voice')); }
    // fake sentence embeddings for the intent classifier (Nika's EMBED_TEST_URL): a bag of words hashed into 256 numbers,
    // so sentences that share words are close, like the real model does with meaning
    if (u.pathname === '/embed') {
      const vec = (t) => { const v = new Array(256).fill(0); String(t).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean).forEach((w) => { let h = 0; for (const ch of w) h = (h * 31 + ch.codePointAt(0)) >>> 0; v[h % 256] += 1; }); return v; };
      const j = JSON.parse(b || '{}'); fs.appendFileSync(LOG, JSON.stringify({ embed: true, n: (j.text || []).length }) + '\n');
      return send(res, 200, { data: (j.text || []).map(vec) });
    }
    if (u.pathname === '/stt') { const j = JSON.parse(b || '{}'); fs.appendFileSync(LOG, JSON.stringify({ stt: true, bytes: Buffer.from(j.audio || '', 'base64').length }) + '\n'); return send(res, 200, { text: 'מה מחכה לי?' }); }
    if (u.pathname.startsWith('/tg/bot')) { const method = u.pathname.split('/').pop(); TGLOG.push({ method, body: JSON.parse(b || '{}') }); return send(res, 200, { ok: true, result: { message_id: TGLOG.length } }); }
    if (u.pathname === '/__tg') return send(res, 200, TGLOG);
    if (u.pathname === '/__gs_version') { GS_VERSION = u.searchParams.get('v') || ''; return send(res, 200, { ok: true }); }
    if (u.pathname === '/__log_reset') { fs.rmSync(LOG, { force: true }); return send(res, 200, { ok: true }); }   // a suite starts from an empty log
    if (u.pathname === '/__tg_reset') { TGLOG = []; return send(res, 200, { ok: true }); }
    if (u.pathname === '/__extra') { EXTRA = { events: [], job_leads: [], interviews: [], ...JSON.parse(b || '{}') }; return send(res, 200, { ok: true }); }
    if (u.pathname === '/__task_done') { const id = u.searchParams.get('id'); TASKS_DONE.add(id === 'last' ? 'task-' + TASK_N : id); return send(res, 200, { ok: true }); }
    if (u.pathname === '/__log') return send(res, 200, fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []);
    if (u.pathname.endsWith(':batchEmbedContents')) { const j = JSON.parse(b); return send(res, 200, { embeddings: j.requests.map((r) => ({ values: vec(r.content.parts[0].text) })) }); }
    if (u.pathname.endsWith(':generateContent')) {
      const j = JSON.parse(b); const sys = j.systemInstruction?.parts?.[0]?.text || ''; const last = j.contents.at(-1).parts[0].text;
      fs.appendFileSync(LOG, JSON.stringify({ gemini: true, model: u.pathname.split('/').pop().split(':')[0], sys: sys.slice(0, 60), tail: last.slice(-70), tools: Array.isArray(j.tools) && j.tools.length > 0, mode: j.toolConfig?.functionCallingConfig?.mode || '', sorted: /תשובות מחברות, ממוינות/.test(last), rag: /ידע על {{FIRST_NAME_HE}} מהאתר/.test(last), json: j.generationConfig?.responseMimeType === 'application/json', turns: j.contents.length,
        said: last.split('\n{{FIRST_NAME_HE}}: ').pop().slice(0, 200), prev: j.contents.slice(0, -1).map((c) => c.parts[0].text).join('\n').slice(-1500), web: /בצ'אט שבדשבורד/.test(last), notes: /העדפות ש{{FIRST_NAME_HE}} שמר בדשבורד/.test(last),
        priv: b.includes('SECRET-PRIVATE-ROW') || b.includes('MOCK-ADDR'), pub: b.includes('PUBLIC-PROFILE-ROW'), addr: sys.includes('MOCK-ADDR') }) + '\n');
      // Nika (Telegram): a real Gemini answer has text parts and, for proposed changes, functionCall parts
      if (/את ניקה/.test(sys)) {
        const parts = (text, calls = []) => send(res, 200, { candidates: [{ content: { parts: [...(text ? [{ text }] : []), ...calls.map(([name, args]) => ({ functionCall: { name, args } }))] } }] });
        // the dashboard's chat (the same Nika): match only what {{FIRST_NAME_EN}} wrote, not the data that rides with it
        const said = last.split('\n{{FIRST_NAME_HE}}: ').pop();
        // security checks (test/nika.test.cjs): a tool call whose arguments try to change its own type and add fields,
        // and a draft to an application's own direct contact (written in capitals)
        if (/בדיקת עקיפה/.test(said)) return parts('בדיקה.', [['add_event', { company: 'Acme Test', kind: 'התקדמות', text: 'בדיקה', type: 'remove_lead', action: 'remove_lead', id: job_leads[0].id, token: 'x', label: 'אירוע' }]]);
        if (/טיוטה לאיש קשר/.test(said)) return parts('הנה טיוטה.', [['create_draft', { to: applications[3].direct_contact.toUpperCase(), subject: 'בדיקה', body: 'שלום', label: 'טיוטה' }]]);
        if (/דיברתי/.test(said)) return parts('הכנתי הצעה לעדכן את Acme Robotics. התקשרו מ-050-1234567.', [['update_application', { id: 'app-01', status: 'בתהליך', note: 'שיחה טלפונית', label: 'Acme Robotics: בתהליך' }], ['update_application', { id: 'no-such-id', status: 'ראיון', label: 'bad id' }]]);
        if (/מייל פולואפ/.test(said)) return parts('הנה טיוטה, אפשר לערוך לפני השמירה.', [['create_draft', { to: 'jobs@acmerobotics.example', subject: 'פולואפ על ההגשה', body: 'שלום,\nרציתי לבדוק את מצב ההגשה שלי. תודה, {{FIRST_NAME_HE}}', label: 'טיוטת פולואפ' }]]);
        if (/מה אמרתי/.test(said)) return parts('אמרת לי משהו קודם, אני זוכרת 🙂');
        if (/התקשרו/.test(last)) return parts('איזה יופי! *הכנתי עדכון*, תאשר בכפתור 👍', [['update_application', { id: 'app-01', status: 'ראיון', next_step: 'ראיון טלפוני', label: 'Acme Robotics: ראיון' }], ['update_application', { id: 'no-such-id', status: 'ראיון', label: 'bad id' }], ['add_event', { company: 'Blocked Example Co', kind: 'התקדמות', text: 'x', label: 'blocked' }]]);
        if (/משימה שנכשלת/.test(last)) return parts('אין בעיה ⏰', [['add_reminder', { when: '2001-01-01T11:00', text: 'FAILTASK להתקשר למגייסת', label: 'תזכורת' }]]);
        if (/תזכירי/.test(last)) return parts('אין בעיה, תאשר ואזכיר לך ⏰', [['add_reminder', { when: '2001-01-01T10:00', text: 'לשלוח פולואפ ל-Acme Robotics', label: 'תזכורת מחר 10:00' }]]);
        if (/מחקי/.test(last)) return parts('הכנתי, תאשר <b>בכפתור</b>', [['remove_lead', { id: job_leads[0].id, label: 'להסיר משרה' }]]);
        // a question answered with a button only (the model's mistake): the site must drop it and ask again without tools
        // "when did I apply?" has the word "applied" but is a question: the intent classifier must stop the button
        if (/מתי הגשתי/.test(last)) return j.toolConfig?.functionCallingConfig?.mode === 'NONE' ? parts('הגשת ל-Nimbus AI ב-1.11.') : parts('', [['add_application', { company: 'Nimbus AI', role: 'AI Engineer', label: 'Nimbus AI: הגשה' }]]);
        // "I set an interview" is in no keyword list, but it is a report: the classifier lets the button through
        if (/קבעתי ראיון/.test(last)) return parts('מעולה! הכנתי עדכון לראיון.', [['update_application', { id: 'app-01', status: 'ראיון', label: 'Acme Robotics: ראיון' }]]);
        if (/הסטטוס של המשרות/.test(last)) return j.toolConfig?.functionCallingConfig?.mode === 'NONE' ? parts('יש לך 2 הגשות פתוחות, ואחת מהן בראיון.') : parts('', [['update_application', { id: 'app-01', status: 'נדחה', label: 'לסמן כנדחה' }]]);
        if (/רק כפתור/.test(last)) return parts('', [['add_application', { company: 'Zeta', role: 'AI Engineer', label: 'Zeta: הגשה' }]]);
        if (/איזה תשובות/.test(last)) return parts(['**Globex:**', '*   עברת את מבחן הגיוס', '### דחיות', '- Initech: לא עומד בדרישות'].join('\n'));
        if (/שני משפטים/.test(last)) return parts('יש פולואפ מחר (11.11) על משרת AI Engineer. הראיונות בוצעו, אז ממתינים. כל הכבוד! 🎯');
        return parts('יש לך 2 הגשות שמחכות לתגובה שלך 🙂');
      }
      if (j.generationConfig?.responseMimeType === 'application/json') {
        if (/^You tailor/.test(sys)) return reply(res, JSON.stringify(cvAnswer(last)));
        if (/^You fix single lines of a CV/.test(sys)) { const list = JSON.parse(last.split(/\n/)[1] || '[]'); return reply(res, JSON.stringify({ fixes: list.map((p) => ({ key: p.key, text: /חדשנית/.test(p.text) ? 'בניתי תוכנית קליטה למלקטים חדשים, וזמן הכניסה לתפקיד ירד מ-3 שבועות ל-9 ימים.' : /^Leveraged/.test(p.text) ? 'Built an onboarding program for new pickers; ramp-up time went down from 3 weeks to 9 days.' : p.text })) })); }
        if (/מייל הגשת מועמדות/.test(sys)) return reply(res, JSON.stringify({ subject: 'מועמדות למשרת Junior Data Analyst – {{NAME_HE}}', body: 'שלום,\nמצורפת מועמדותי למשרה. בניתי מערכת לחיזוי עיכובים במשלוחים (88.2%) ושירות ב-FastAPI.\nקורות החיים מצורפים.\n\n{{NAME_HE}} | {{EMAIL}}' }));
        if (/דיברתי/.test(last)) return reply(res, JSON.stringify({ reply: 'עדכנתי הצעה: לסמן שהיה ראיון טלפוני. התקשרו מ-050-1234567.', actions: [{ type: 'update_application', id: 'app-01', status: 'בתהליך', note: 'שיחה טלפונית' }, { type: 'send_email', to: 'x' }], email: null, remember: null }));
        if (/מייל|פולואפ/.test(last)) return reply(res, JSON.stringify({ reply: 'הנה טיוטה.', actions: [], email: { to: 'jobs@acmerobotics.example', subject: 'פולואפ על ההגשה', body: 'שלום,\nרציתי לבדוק את מצב ההגשה שלי. תודה, {{FIRST_NAME_HE}}' }, remember: null }));
        return reply(res, JSON.stringify({ reply: 'השבוע מחכות לך 2 תגובות ו-3 פולואפים.', actions: [], email: null, remember: null }));
      }
      if (/interviewer|מראיין/.test(sys)) return reply(res, /סיכום|summary/.test(last) ? 'חוזקות: 1. … ציון: 7/10' : 'שאלה ראשונה: ספר על פרויקט שבנית ב-Python ומה היה הקושי הכי גדול.');
      if (/לשפר את קורות החיים/.test(sys)) return reply(res, '1. מה כבר מתאים: Python, SQL ופרויקט ShelfScan.\n2. להדגיש: פריסה ב-FastAPI.\n3. במקום: "Developed a system" עדיף: "Built and deployed a Random Forest model with FastAPI".\n4. תקציר: …');
      return reply(res, '{{FIRST_NAME_HE}} בונה פרויקטים ב-Python ו-AI.');
    }
    send(res, 404, { error: 'nf' });
  });
}).listen(Number(process.env.MOCK_PORT) || 8788, '127.0.0.1', () => console.log('mock on ' + (Number(process.env.MOCK_PORT) || 8788)));
