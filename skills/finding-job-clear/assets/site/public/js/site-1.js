// a profile photo that fails to load is removed, so the initials underneath show instead
document.querySelectorAll('.avatar img').forEach((img) => { const drop = () => img.remove(); img.addEventListener('error', drop); if (img.complete && !img.naturalWidth) drop(); });
const T = {
  en: { tagline: '{{TAGLINE_EN}}', open: '{{LOOKING_FOR_EN}}', where: '{{WHERE_EN}}',
    ask_btn: 'Ask about me', email: 'Email', ask_h: 'Ask me anything', ask_hint: 'An AI assistant answers in my name, about me and my work.',
    ph: 'For example, what have you built with machine learning?', proj_h: 'My projects', proj_hint: '{{PROJECTS_HINT_EN}}',
    prev: 'Previous project', next: 'Next project', pick: 'Choose a project', track: 'Projects. Use the arrow keys to move.', of: 'of', ask_proj: 'Ask about it', nav_proj: 'Projects', nav_chat: 'Chat', nav_exp: 'Experience', nav_sk: 'Skills', qnav: 'On this page', owner: 'Sign in to my area', exp_h: 'My experience and education', sk_h: 'My skills and tools',
    demo: 'Demo mode. No Gemini key is set, so you see the matching passages instead of a written answer.', privacy: 'The site keeps anonymous usage stats and chat questions for 90 days (no IP addresses) to improve it.',
    chips: ['{{CHIP_1_EN}}', '{{CHIP_2_EN}}', '{{CHIP_3_EN}}', '{{CHIP_4_EN}}'],
    live: 'Live demo', mine: 'My dashboard', cv: 'CV', cv_en: 'English (PDF)', cv_he: 'Hebrew (PDF)', mail_gmail: 'Write in Gmail', mail_app: 'Open mail app', mail_copy: 'Copy address', copied: 'Copied ✓', code: 'Code', wa: 'WhatsApp', fail: "Couldn't get an answer right now. Please try again." },
  he: { tagline: '{{TAGLINE_HE}}', open: '{{LOOKING_FOR_HE}}', where: '{{WHERE_HE}}',
    ask_btn: 'לשאול עליי', email: 'מייל', ask_h: 'אפשר לשאול אותי כל דבר', ask_hint: 'עוזר AI עונה בשמי על כל שאלה עליי ועל העבודה שלי.',
    ph: 'למשל, מה בנית עם למידת מכונה?', proj_h: 'הפרויקטים שלי', proj_hint: '{{PROJECTS_HINT_HE}}',
    prev: 'הפרויקט הקודם', next: 'הפרויקט הבא', pick: 'בחירת פרויקט', track: 'פרויקטים. אפשר לעבור עם מקשי החצים.', of: 'מתוך', ask_proj: 'לשאול על הפרויקט', nav_proj: 'פרויקטים', nav_chat: 'צ׳אט', nav_exp: 'ניסיון', nav_sk: 'כישורים', qnav: 'בעמוד הזה', owner: 'כניסה לאזור האישי', exp_h: 'הניסיון וההשכלה שלי', sk_h: 'הכישורים והכלים שלי',
    demo: 'מצב הדגמה. לא הוגדר מפתח Gemini, ולכן מוצגים הקטעים הרלוונטיים במקום תשובה כתובה.', privacy: 'האתר שומר נתוני שימוש אנונימיים ושאלות מהצ׳אט ל-90 יום (בלי כתובות IP) כדי לשפר אותו.',
    chips: ['{{CHIP_1_HE}}', '{{CHIP_2_HE}}', '{{CHIP_3_HE}}', '{{CHIP_4_HE}}'],
    live: 'לאתר החי', mine: 'האזור האישי', cv: 'קורות חיים', cv_en: 'אנגלית (PDF)', cv_he: 'עברית (PDF)', mail_gmail: 'כתיבה ב-Gmail', mail_app: 'פתיחה באפליקציית המייל', mail_copy: 'העתקת הכתובת', copied: 'הועתק ✓', code: 'הקוד', wa: 'וואטסאפ', fail: 'לא הצלחתי לענות כרגע. אפשר לנסות שוב.' }
};
// ordered by fit to the target roles; the id is also the deep link (#my-project). Copy the object for each project.
// stat/statT: one key result (a number when there is one). live and gh are optional (delete the key). icon: the inside of a 24x24 stroke SVG.
const PROJECTS = [
  { id: '{{PROJECT_1_ID}}', t: '{{PROJECT_1_NAME}}', chip: '{{PROJECT_1_SHORT_NAME}}',
    kind: { en: '{{PROJECT_1_KIND_EN}}', he: '{{PROJECT_1_KIND_HE}}' }, stat: '{{PROJECT_1_STAT}}', statT: { en: '{{PROJECT_1_STAT_TEXT_EN}}', he: '{{PROJECT_1_STAT_TEXT_HE}}' },
    en: ['{{PROJECT_1_PARAGRAPH_1_EN}}', '{{PROJECT_1_PARAGRAPH_2_EN}}'],
    he: ['{{PROJECT_1_PARAGRAPH_1_HE}}', '{{PROJECT_1_PARAGRAPH_2_HE}}'],
    live: '{{PROJECT_1_LIVE_URL}}', gh: '{{PROJECT_1_GITHUB_URL}}',
    q: { en: '{{PROJECT_1_QUESTION_EN}}', he: '{{PROJECT_1_QUESTION_HE}}' },
    icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>' },
];
// experience and education, newest first. m: the years (a plain string, or { en, he } when it says "now")
const EXP = [
  { m: '{{EXP_1_YEARS}}', t: { en: '{{EXP_1_TITLE_EN}}', he: '{{EXP_1_TITLE_HE}}' },
    d: { en: '{{EXP_1_TEXT_EN}}', he: '{{EXP_1_TEXT_HE}}' } },
];
// skills and tools, grouped; a plain string is the same in both languages
const SKILLS = [
  { h: { en: 'Programming languages', he: 'שפות תכנות' }, items: ['{{SKILL_LANGUAGE_1}}'] },
  { h: { en: 'AI and LLMs', he: 'בינה מלאכותית ומודלי שפה' }, items: ['{{SKILL_AI_1}}'] },
  { h: { en: 'Tools', he: 'כלים' }, items: ['{{SKILL_TOOL_1}}'] },
  { h: { en: 'Languages', he: 'שפות' }, items: [{ en: 'Hebrew, native', he: 'עברית, שפת אם' }, { en: '{{OTHER_LANGUAGE_EN}}', he: '{{OTHER_LANGUAGE_HE}}' }] },
];
let lang = 'he'; const history = [];
const $ = (s) => document.querySelector(s);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function render() {
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-t]').forEach((n) => { const v = T[lang][n.dataset.t]; if (v) n.textContent = v; });
  $('#q').placeholder = T[lang].ph;
  document.querySelectorAll('[data-ta]').forEach((n) => { const v = T[lang][n.dataset.ta]; if (v) n.setAttribute('aria-label', v); });
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
  const chips = $('#chips'); chips.replaceChildren();
  T[lang].chips.forEach((c) => { const b = el('button', 'chip', c); b.type = 'button'; b.addEventListener('click', () => ask(c)); chips.append(b); });
  renderProjects();
  const ex = $('#experience'); ex.replaceChildren();
  EXP.forEach((x) => { const t = el('div', 'tile'); const m = el('div', 'meta num', pick(x.m)); m.dir = 'ltr'; t.append(m, el('h3', '', x.t[lang]), el('p', '', x.d[lang])); ex.append(t); });
  const sk = $('#skills'); sk.replaceChildren();
  SKILLS.forEach((g) => { const box = el('div', 'skgroup'); box.append(el('h3', '', pick(g.h)));
    const row = el('div', 'skills'); g.items.forEach((x) => row.append(el('span', 'pill', pick(x)))); box.append(row); sk.append(box); });
}
// ---------- projects carousel ----------
const ptrack = $('#ptrack'), prail = $('#prail'), pcount = $('#pcount');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const motion = () => (reduceMotion.matches ? 'auto' : 'smooth');
const pick = (v) => (v && typeof v === 'object' ? v[lang] : v);
const two = (n) => String(n).padStart(2, '0');
const icon = (inner, size, cls) => `<svg${cls ? ` class="${cls}"` : ''} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
const EXT_I = '<path d="M7 17 17 7M8 7h9v9"/>', SPARK_I = '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>';
const GH_I = '<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12 12 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/>';
const hashIndex = () => PROJECTS.findIndex((p) => '#' + p.id === location.hash);
// pTarget: where the arrows count from, so fast repeated clicks keep going even while a glide is still moving
let pActive = -1, pWant = Math.max(0, hashIndex()), pTarget = pWant, pNavUntil = 0, pQuiet = true, pFade = 0, pTick = false;
const viewed = new Set();
function renderProjects() {
  pQuiet = true;
  if (pActive >= 0) pWant = pActive;
  pActive = -1; pTarget = pWant;
  const L = T[lang], n = PROJECTS.length;
  ptrack.replaceChildren(); prail.replaceChildren();
  PROJECTS.forEach((p, i) => {
    const s = el('article', 'slide'); s.id = 'proj-' + p.id; s.dataset.name = p.t;
    s.setAttribute('role', 'group'); s.setAttribute('aria-roledescription', 'slide'); s.setAttribute('aria-label', `${i + 1} ${L.of} ${n}: ${p.t}`);
    const num = el('span', 's-num', two(i + 1)); num.setAttribute('aria-hidden', 'true');
    const top = el('div', 's-top'), ic = el('span', 's-ico'); ic.innerHTML = icon(p.icon, 22); top.append(ic, el('span', 's-kind', pick(p.kind)));
    const h = el('h3', 's-title'); h.append(el('bdi', '', pick(p.tt) || p.t));
    s.append(num, top, h);
    if (p.sub) { const sub = el('p', 's-sub'); sub.append(el('bdi', '', p.sub)); s.append(sub); }
    const st = el('div', 's-stat'); st.append(el('b', '', pick(p.stat)), el('span', '', pick(p.statT)));
    const lk = el('div', 'plinks');
    if (p.live) { const a = el('a', 'btn primary plink'); a.href = p.live; a.target = '_blank'; a.rel = 'noopener'; a.append(el('span', '', L.live)); a.insertAdjacentHTML('beforeend', icon(EXT_I, 16, 'ext')); lk.append(a); }
    if (p.gh) { const a = el('a', 'btn secondary plink'); a.href = p.gh; a.target = '_blank'; a.rel = 'noopener'; a.innerHTML = icon(GH_I, 16); a.append(el('span', '', 'GitHub')); lk.append(a); }
    const ab = el('button', 'btn secondary pask'); ab.type = 'button'; ab.innerHTML = icon(SPARK_I, 16); ab.append(el('span', '', L.ask_proj));
    ab.addEventListener('click', () => askAbout(p)); lk.append(ab);
    s.append(st, ...p[lang].map((t) => el('p', 's-desc', t)), lk);
    ptrack.append(s);
    const c = el('button', 'pchip'); c.type = 'button'; c.append(el('bdi', '', pick(p.chip))); c.addEventListener('click', () => goProject(i));
    prail.append(c);
  });
  requestAnimationFrame(() => { centerSlide(pWant, 'auto'); measure(); pQuiet = false; });
}
// scroll the strip sideways only, never the page
function centerSlide(i, behavior) {
  const s = ptrack.children[i]; if (!s) return;
  const r = ptrack.getBoundingClientRect(), b = s.getBoundingClientRect();
  ptrack.scrollBy({ left: (b.left + b.width / 2) - (r.left + r.width / 2), behavior });
}
function goProject(i) {
  const n = PROJECTS.length, wrap = i < 0 || i >= n;
  i = (i + n) % n;
  pTarget = i; pNavUntil = performance.now() + 700;
  // a near card glides; wrapping or a far jump fades out, jumps and fades back in, instead of rewinding past every card
  if (!wrap && Math.abs(i - pActive) <= 2) { centerSlide(i, motion()); return; }
  if (reduceMotion.matches) { centerSlide(i, 'auto'); return; }
  clearTimeout(pFade); ptrack.classList.add('fading');
  pFade = setTimeout(() => { centerSlide(i, 'auto'); measure(); ptrack.classList.remove('fading'); }, 160);
}
function setActive(i) {
  if (performance.now() > pNavUntil) pTarget = i;
  if (i === pActive) return;
  pActive = i;
  [...ptrack.children].forEach((s, k) => s.classList.toggle('on', k === i));
  [...prail.children].forEach((c, k) => c.setAttribute('aria-current', String(k === i)));
  pcount.replaceChildren(el('b', '', two(i + 1)), document.createTextNode(' / ' + two(PROJECTS.length)));
  fitTrack();
  const name = PROJECTS[i].t;
  if (!pQuiet && !viewed.has(name)) { viewed.add(name); stats.click('project:' + name + ' · viewed'); }
}
// each card keeps its own height: the strip takes the height of the card in view (+ its 4px/6px padding)
function fitTrack() { const s = ptrack.children[pActive]; if (s) ptrack.style.height = (s.offsetHeight + 10) + 'px'; }
document.fonts?.ready.then(fitTrack);
// continuous feedback while swiping: each card scales and fades by its distance from the center
function measure() {
  pTick = false;
  const r = ptrack.getBoundingClientRect(), mid = r.left + r.width / 2;
  let best = 0, bestD = Infinity;
  [...ptrack.children].forEach((s, k) => {
    const b = s.getBoundingClientRect(), d = b.width ? Math.min(1, Math.abs(b.left + b.width / 2 - mid) / b.width) : 1;
    s.style.setProperty('--d', d.toFixed(3));
    if (d < bestD) { bestD = d; best = k; }
  });
  setActive(best);
}
ptrack.addEventListener('scroll', () => { if (!pTick) { pTick = true; requestAnimationFrame(measure); } }, { passive: true });
addEventListener('resize', () => { if (pActive >= 0) { centerSlide(pActive, 'auto'); measure(); fitTrack(); } });
// quick links: mark the section in view
const QNAV = [['proj-card', 0], ['ask', 1], ['exp-card', 2], ['sk-card', 3]];
let qTick = false;
function markSection() {
  qTick = false;
  let cur = -1, best = -Infinity;
  QNAV.forEach(([id, k]) => { const t = document.getElementById(id).getBoundingClientRect().top; if (t <= 140 && t > best) { best = t; cur = k; } });
  [...$('#qnav').children].forEach((a, k) => a.setAttribute('aria-current', String(k === cur)));
}
addEventListener('scroll', () => { if (!qTick) { qTick = true; requestAnimationFrame(markSection); } }, { passive: true });
$('#p-prev').addEventListener('click', () => goProject(pTarget - 1));
$('#p-next').addEventListener('click', () => goProject(pTarget + 1));
ptrack.addEventListener('keydown', (e) => {
  const rtl = document.documentElement.dir === 'rtl';
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); goProject(pTarget + ((e.key === 'ArrowLeft') === rtl ? 1 : -1)); }
  else if (e.key === 'Home') { e.preventDefault(); goProject(0); } else if (e.key === 'End') { e.preventDefault(); goProject(PROJECTS.length - 1); }
});
// "Ask about it": jump to the chat and send a ready question about this project
function askAbout(p) {
  $('#ask').scrollIntoView({ behavior: motion(), block: 'start' });
  ask(p.q[lang]);
}
// deep link: /#<project id> opens the page on that project
addEventListener('hashchange', () => { const i = hashIndex(); if (i >= 0) { goProject(i); $('#proj-card').scrollIntoView({ behavior: motion(), block: 'start' }); } });

document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { lang = b.dataset.lang; try { localStorage.setItem('lang', lang); } catch {} render(); }));
try { const s = localStorage.getItem('lang'); if (s === 'he' || s === 'en') lang = s; } catch {}
render();
if (hashIndex() >= 0) requestAnimationFrame(() => requestAnimationFrame(() => $('#proj-card').scrollIntoView({ block: 'start' })));
setInterval(() => {
  const imgs = [...document.querySelectorAll('.avatar img')]; if (imgs.length < 2) return;
  const i = imgs.findIndex((x) => x.classList.contains('on'));
  imgs[i]?.classList.remove('on'); imgs[(i + 1) % imgs.length].classList.add('on');
}, 30000);
// menus: one open at a time, close on outside click or Escape
const menus = [...document.querySelectorAll('details.menu')];
menus.forEach((m) => m.addEventListener('toggle', () => { if (m.open) menus.forEach((o) => { if (o !== m) o.open = false; }); }));
document.addEventListener('click', (e) => menus.forEach((m) => { if (m.open && !m.contains(e.target)) m.open = false; }));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') menus.forEach((m) => { if (m.open) { m.open = false; m.querySelector('summary').focus(); } }); });
document.querySelectorAll('.menu-list a').forEach((a) => a.addEventListener('click', () => { a.closest('details').open = false; }));
$('#copy-mail').addEventListener('click', async (e) => {
  const b = e.currentTarget;
  try { await navigator.clipboard.writeText('{{EMAIL}}'); b.textContent = T[lang].copied; } catch { b.textContent = '{{EMAIL}}'; }
  setTimeout(() => { b.textContent = T[lang].mail_copy; }, 2000);
});
// anonymous visit stats for {{FIRST_NAME_EN}}'s private area: time on page, how far down, which buttons; never when {{FIRST_NAME_EN}} is logged in
const stats = (() => {
  let sid = '';
  try { sid = sessionStorage.getItem('sid') || ''; if (!sid) { sid = Math.random().toString(36).slice(2, 14).padEnd(10, '0'); sessionStorage.setItem('sid', sid); } } catch { sid = Math.random().toString(36).slice(2, 14).padEnd(10, '0'); }
  let on = false, seconds = 0, depth = 0;
  const seen = new Set(['top']);
  const send = (body, beacon) => { if (!on) return; const s = JSON.stringify({ sid, ...body }); try { if (beacon && navigator.sendBeacon) navigator.sendBeacon('/api/t', s); else fetch('/api/t', { method: 'POST', body: s, keepalive: true }).catch(() => {}); } catch {} };
  let lastKey = '', soon = 0;
  const ping = (beacon) => { const key = seconds + '|' + depth + '|' + seen.size; if (key !== lastKey) { lastKey = key; send({ e: 'ping', seconds, depth, sections: [...seen] }, beacon); } };
  // phones often never fire pagehide, so also report shortly after something changes
  const later = () => { clearTimeout(soon); soon = setTimeout(() => ping(false), 2000); };
  const measure = () => { const h = document.documentElement.scrollHeight - innerHeight, d = h > 0 ? Math.round(scrollY / h * 100) : 100; if (d >= depth + 10 || (d === 100 && depth < 100)) later(); depth = Math.max(depth, d); };
  function start() {
    on = true; measure();
    send({ e: 'view', ref: document.referrer, lang });
    setInterval(() => { if (document.visibilityState === 'visible') { seconds++; if (seconds === 5 || seconds % 15 === 0) ping(false); } }, 1000);
    addEventListener('scroll', measure, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') ping(true); });
    addEventListener('pagehide', () => ping(true));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting && !seen.has(e.target.dataset.sec)) { seen.add(e.target.dataset.sec); later(); } }), { threshold: 0.35 });
    [['#ask', 'chat'], ['section[aria-labelledby="proj-h"]', 'projects'], ['section[aria-labelledby="exp-h"]', 'experience'], ['section[aria-labelledby="sk-h"]', 'skills'], ['footer', 'end']]
      .forEach(([sel, name]) => { const el = document.querySelector(sel); if (el) { el.dataset.sec = name; io.observe(el); } });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a, button'); if (!a) return;
      const href = a.getAttribute('href') || '';
      const what = href.startsWith('https://mail.google.com') ? 'email-gmail' : href.startsWith('mailto:') ? 'email-app' : a.id === 'copy-mail' ? 'email-copy'
        : href.endsWith('-HE.pdf') ? 'cv-he' : href.endsWith('-EN.pdf') ? 'cv-en' : href.includes('wa.me') ? 'whatsapp' : href === '{{GITHUB_URL}}' ? 'github'
        : a.dataset.lang ? 'lang-' + a.dataset.lang : a.classList.contains('chip') ? 'chip'
        : a.classList.contains('plink') ? 'project:' + (a.closest('.slide')?.dataset.name || '').slice(0, 40) + (href.includes('github.com') ? ' · GitHub' : ' · live')
        : a.classList.contains('pask') ? 'project:' + (a.closest('.slide')?.dataset.name || '').slice(0, 40) + ' · ask' : '';
      if (what) send({ e: 'click', what });
    }, true);
  }
  // no id while stats are off (my own device), so the server doesn't record my chat questions either
  return { get sid() { return on ? sid : ''; }, start, click: (what) => send({ e: 'click', what }) };
})();
// a device I signed in on once is mine for good: it is never counted, even after the sign-in expires
const ownDevice = () => { try { return localStorage.getItem('owner') === '1'; } catch { return false; } };
fetch('/api/me').then((r) => r.json()).then((j) => {
  $('#mine').hidden = !j.admin;
  if (j.admin) { try { localStorage.setItem('owner', '1'); } catch {} }
  else if (!ownDevice()) stats.start();
}).catch(() => { if (!ownDevice()) stats.start(); });

const log = $('#log'), q = $('#q'), send = $('.send');
// A chat bubble's direction comes from its own language, not from its first letter: any Hebrew makes it
// right-to-left (so "Java לא..." still reads from the right). Inside Hebrew, each run of Latin text
// (names, tools, numbers, "Solutions Architect / Junior") is isolated so its punctuation stays in place.
const LATIN_RUN = /[A-Za-z0-9@][A-Za-z0-9@#+.,/&'()%_\- ]*[A-Za-z0-9+#)%]|[A-Za-z0-9]/g;
function bubble(cls, text) {
  const b = el('div', cls), rtl = /[֐-׿]/.test(text);
  b.dir = rtl ? 'rtl' : 'ltr';
  if (!rtl) { b.textContent = text; return b; }
  let last = 0;
  for (const m of text.matchAll(LATIN_RUN)) {
    if (m.index > last) b.append(text.slice(last, m.index));
    b.append(el('bdi', '', m[0])); last = m.index + m[0].length;
  }
  if (last < text.length) b.append(text.slice(last));
  return b;
}
async function ask(text) {
  text = String(text || '').trim(); if (!text || send.disabled) return;
  q.value = ''; q.style.height = '';
  const me = bubble('msg me', text); log.append(me);
  const sk = el('div', 'skel'); sk.append(el('i'), el('i'), el('i')); log.append(sk); log.scrollTop = log.scrollHeight;
  send.disabled = true;
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: text, history: history.slice(-6), sid: stats.sid }) });
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const m = bubble('msg ai', j.answer);
    sk.replaceWith(m);
    // buttons to the projects the answer talks about (addresses from the server's fixed list, https only)
    const links = (Array.isArray(j.links) ? j.links : []).slice(0, 3);
    if (links.length) {
      const he = /[֐-׿]/.test(j.answer), row = el('div', 'clinks');
      row.dir = he ? 'rtl' : 'ltr';
      links.forEach((p) => [['live', T[he ? 'he' : 'en'].live], ['code', T[he ? 'he' : 'en'].code]].forEach(([k, label]) => {
        if (!/^https:\/\//.test(String(p[k] || ''))) return;
        const a = el('a', 'clink'); a.href = p[k]; a.target = '_blank'; a.rel = 'noopener';
        a.append(el('bdi', '', p.name), el('span', 'dot', '·'), el('span', '', label)); row.append(a);
      }));
      if (row.children.length) m.after(row);
    }
    $('#demo').hidden = j.mode !== 'demo';
    history.push({ role: 'user', text }, { role: 'assistant', text: j.answer });
  } catch { sk.replaceWith(el('div', 'msg err', T[lang].fail)); }
  finally { send.disabled = false; log.scrollTop = log.scrollHeight; }
}
$('#form').addEventListener('submit', (e) => { e.preventDefault(); ask(q.value); });
q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(q.value); } });
q.addEventListener('input', () => { q.style.height = 'auto'; q.style.height = Math.min(q.scrollHeight, 140) + 'px'; });
