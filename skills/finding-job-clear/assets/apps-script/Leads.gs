/**
 * Leads.gs — scores new LinkedIn jobs with Gemini, without Claude (fourth file in the "Job Feed" project).
 * 'משרות' → one Gemini call per run (up to 8 jobs) → good fits go to 'משרות מומלצות'; strong fits get a Google Task.
 * Uses readTab_/appendRow_/today_ (Api.gs), askGemini_/ownerProfile_ (Shared.gs), BLOCKED/ensureTask_/DASHBOARD (Code.gs).
 * The score is kept at the start of `why` ("85 · …"), so the tab keeps its columns.
 * Every job_id it looked at (fits and rejects) is remembered in the 'leads_scored' property, so nothing is scored twice.
 */
const LEADS_MAX = 8;
const LEADS_DAYS = 14;                 // only jobs seen in the last two weeks
const LEADS_KEEP = 400;                // how many scored job_ids the property remembers
const LEADS_STRONG = 75;               // 'מתאים מאוד' with this score or more → a Google Task
const LEADS_SENIOR = /senior|staff|principal|\blead\b|director|head of|\bvp\b|\bsr\b|phd|expert|מנוסה|בכיר/i;
const LEADS_FITS = ['מתאים מאוד', 'מתאים', 'לא מתאים'];

function leadsScored_() {
  try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('leads_scored') || '[]'); } catch (e) { return []; }
}
function saveLeadsScored_(ids) {
  PropertiesService.getScriptProperties().setProperty('leads_scored', JSON.stringify(ids.slice(-LEADS_KEEP)));
}

function scoreNewLeads_(max) {
  max = Math.min(Number(max) || LEADS_MAX, LEADS_MAX);
  const L = API_TABS.job_leads.name;
  if (!sheetOf_(L)) ensureTabs_();
  const done = new Set(leadsScored_().map(String));
  readTab_(L).forEach((r) => { if (/^li-/.test(r.id)) done.add(String(r.id).slice(3)); });
  readTab_(API_TABS.applications.name).forEach((a) => { if (a.job_id) done.add(String(a.job_id)); });   // applied already
  const cutoff = Utilities.formatDate(new Date(Date.now() - LEADS_DAYS * 864e5), API_TZ, 'yyyy-MM-dd');
  const todo = readTab_('משרות')
    .filter((j) => j.job_id && !done.has(String(j.job_id)) && String(j.seen).slice(0, 10) >= cutoff)
    .filter((j) => !BLOCKED.test(j.company + ' ' + j.title) && !LEADS_SENIOR.test(j.title))
    .sort((a, b) => String(b.seen).localeCompare(String(a.seen)))
    .slice(0, max);
  if (!todo.length) return { scored: 0 };

  const list = todo.map((j) => ({ job_id: String(j.job_id), title: j.title, company: j.company, location: j.location }));
  const prompt = [
    'You screen LinkedIn jobs for this candidate. Be honest and strict; do not invent facts about companies or roles.',
    'CANDIDATE:', ownerProfile_(),
    'RULES:',
    '- fit "מתאים מאוד" only for the five target roles (AI Solutions Engineer, AI Application Developer, Solutions Architect / Junior Solutions Engineer, Integration Engineer, AI Product Manager) at a level they can get (junior / entry / no long experience demanded).',
    '- general junior / entry-level roles in software or AI (junior developer, Python developer, data / ML / AI junior, junior data scientist or analyst) are "מתאים": they are open to them too, though the five target roles come first.',
    '- student, intern, QA, support, sales or non-software roles are "לא מתאים".',
    '- senior roles, any role that asks for 2 or more years of experience ("2+ years", "3 years", "שנתיים ומעלה"), and roles in languages they do not know are "לא מתאים". He has about one year of hands-on experience.',
    '- score 0-100 = how worth it is to apply now. why = 1-2 short Hebrew sentences. about = one short Hebrew line on the company only if you really know it, else "".',
    'Return ONLY a JSON array, one item per job: [{"job_id":"...","score":0,"fit":"מתאים מאוד|מתאים|לא מתאים","why":"...","about":"..."}]',
    'JOBS:', JSON.stringify(list),
  ].join('\n');
  const res = askGemini_(prompt, { json: true, maxTokens: 2400 });
  if (!res) return { scored: 0, skipped: 'no_ai' };
  const arr = Array.isArray(res) ? res : (res.jobs || res.results || []);

  const t = today_(), at = new Date(); at.setDate(at.getDate() + 2); at.setHours(10, 0, 0, 0);
  const out = { scored: 0, added: 0, tasks: 0 };
  const ids = leadsScored_();
  todo.forEach((j) => {
    const r = arr.find((x) => x && String(x.job_id) === String(j.job_id));
    if (!r || LEADS_FITS.indexOf(r.fit) < 0) return;   // missing or malformed: try again next run
    const score = Math.max(0, Math.min(100, Math.round(Number(r.score) || 0)));
    const why = STRIP_PHONES(String(r.why || '')).replace(/\s+/g, ' ').trim().slice(0, 400);
    ids.push(String(j.job_id)); out.scored++;
    if (r.fit === 'לא מתאים') return;
    appendRow_(API_TABS.job_leads.name, { id: 'li-' + j.job_id, company: j.company, role: j.title, seen: t, fit: r.fit, why: score + ' · ' + why, origin: '',
      location: j.location, status: 'חדש', about: STRIP_PHONES(String(r.about || '')).slice(0, 300), role_desc: '', link: j.link, mail_link: j.mail_link, source: 'LinkedIn + Gemini' });
    out.added++;
    if (r.fit === 'מתאים מאוד' && score >= LEADS_STRONG) {
      try { if (ensureTask_('lead_' + j.job_id, 'להגיש: ' + j.title + ' – ' + j.company, why + '\n' + j.link, at)) out.tasks++; }
      catch (e) { console.warn('lead task failed', e); }
    }
  });
  saveLeadsScored_(ids);
  console.log('leads', JSON.stringify(out));
  return out;
}

/** Strong leads ('מתאים מאוד') seen since `sinceDay` (yyyy-MM-dd), best score first — for the digest mail. */
function leadsForDigest_(sinceDay) {
  return readTab_(API_TABS.job_leads.name)
    .filter((r) => r.fit === 'מתאים מאוד' && String(r.seen).slice(0, 10) >= String(sinceDay || ''))
    .map((r) => {
      const m = String(r.why || '').match(/^(\d{1,3})\s*·\s*([\s\S]*)$/);
      return { id: r.id, company: r.company, role: r.role, location: r.location, score: m ? +m[1] : 0, why: m ? m[2] : r.why, link: r.link, mail_link: r.mail_link };
    })
    .sort((a, b) => b.score - a.score);
}
