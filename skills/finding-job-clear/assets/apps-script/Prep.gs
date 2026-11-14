/**
 * Prep.gs — interview prep pages and follow-up drafts, without Claude (fourth file in the "Job Feed" project).
 * Uses Gemini through askGemini_ (Shared.gs). Without GEMINI_KEY both steps are skipped quietly.
 * Never sends email: follow-ups are only Gmail DRAFT replies for {{FIRST_NAME_EN}} to check and send themselves.
 */
// condensed from website/knowledge/personality.md — real stories for STAR answers
// real stories for STAR answers in the interview prep pages, condensed from knowledge/personality.md
// CHANGE: only the user's own true stories, never invented ones
const OWNER_STORIES = [
  'Stories (use only these, never invent): {{STORY_CONTEXT}}',
  '1) {{STORY_1}}',
  '2) {{STORY_2}}',
  '3) {{STORY_3}}',
  'Strengths: {{STRENGTHS}}. Weakness: {{WEAKNESS}}.',
  'Values: {{VALUES}}. In 5 years: {{FIVE_YEARS}}.',
].join('\n');
const PREP_DAYS = 14;
const OWNER_PHONE = '{{PHONE}}';

const prepLine_ = (s) => String(s || '').replace(/[|\s]+/g, ' ').trim();
const atHour_ = (days, h) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, h, 0); };
const threadLink_ = (t) => 'https://mail.google.com/mail/u/0/#all/' + t;

/* ===== A) interview prep: one Gemini call per interview, a row in "הכנה" and a task ===== */
function prepInterviews_(max) {
  max = max || 2;
  const A = API_TABS.applications.name, P = API_TABS.prep.name;
  const have = new Set(readTab_(P).map((p) => String(p.app_id)));
  const cutoff = plusDays_(today_(), -PREP_DAYS);
  const ivs = readTab_(API_TABS.events.name).filter((e) => e.kind === 'ראיון' && String(e.date).slice(0, 10) >= cutoff);
  const hadIv = (a) => ivs.some((e) => (a.thread_id && String(e.thread_id) === String(a.thread_id)) || slug_(e.company) === slug_(a.company));
  const todo = readTab_(A).filter((a) => a.id && !have.has(String(a.id)) && a.status !== 'נדחה' && !BLOCKED.test(a.company + ' ' + a.role)
    && (a.status === 'ראיון' || hadIv(a)));
  let made = 0;
  for (const a of todo) {
    if (made >= max) break;
    const role = a.role && a.role !== 'לא צוין' ? a.role : '';
    const o = askGemini_([
      'You help {{FIRST_NAME_EN}} prepare for a job interview. Answer in Hebrew. Return JSON only:',
      '{"about": "2-3 sentences on the company", "questions": [{"q": "likely question", "hint": "one line: which of {{FIRST_NAME_EN}}\'s real stories to use"}], "todo": ["concrete prep step"]}',
      'Rules: "about" — what the company does; if you are not sure, say clearly that you are not sure and that they should check the company site. Never invent facts.',
      'Exactly 6 questions for this role (technical and behavioral). Each hint points to one real story, result or project from the profile and stories below (never an invented one). 3-5 todo steps.',
      'Company: ' + a.company, 'Role: ' + (role || 'not stated'),
      '{{FIRST_NAME_EN}} profile:\n' + ownerProfile_(), profileGet_('סיפורים לראיון') || OWNER_STORIES,
    ].join('\n'), { json: true, maxTokens: 1500 });
    if (!o || !o.about) return made;   // no key / no budget / bad answer: stop for this run
    const qs = (o.questions || []).slice(0, 6).map((q) => (typeof q === 'string' ? prepLine_(q) : prepLine_(q.q) + (q.hint ? ' — ' + prepLine_(q.hint) : ''))).filter(Boolean);
    const steps = (o.todo || []).slice(0, 5).map(prepLine_).filter(Boolean);
    const about = String(o.about).trim().slice(0, 800);
    appendRow_(P, { id: 'prep-' + a.id, app_id: a.id, company: a.company, role: a.role, created: today_(), stage: 'ראיון', about,
      questions: qs.join('|'), todo: steps.join('|'), link: a.link || (a.thread_id ? threadLink_(a.thread_id) : ''), thread_id: a.thread_id });
    have.add(String(a.id)); made++;
    try { ensureTask_('prep_' + a.id, 'להתכונן לראיון – ' + a.company, 'דף הכנה בדשבורד: ' + DASHBOARD + '\n' + about, atHour_(1, 18)); }
    catch (e) { console.warn('prep task failed', e); }
  }
  return made;
}

/* ===== B) follow-up drafts: a Gmail draft reply only, never sent ===== */
function followupDrafts_(max) {
  max = max || 3;
  const A = API_TABS.applications.name, today = today_();
  const me = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const due = readTab_(A).filter((a) => ['הוגש', 'בתהליך'].indexOf(a.status) >= 0 && a.followup_after && String(a.followup_after).slice(0, 10) <= today
    && !a.followup_draft && a.thread_id && !BLOCKED.test(a.company + ' ' + a.role));
  let made = 0;
  for (const a of due) {
    if (made >= max) break;
    let th = null; try { th = GmailApp.getThreadById(String(a.thread_id)); } catch (e) {}
    if (!th) continue;
    const msgs = th.getMessages();
    if (msgs.some((m) => m.isDraft && m.isDraft())) continue;   // a draft is already waiting in this thread
    const last = msgs[msgs.length - 1];
    if (!last || (me && senderEmail_(last.getFrom()) === me)) continue;   // {{FIRST_NAME_EN}} wrote last: waiting for them (the address, not the name)
    const subject = th.getFirstMessageSubject() || last.getSubject() || '';
    if (BLOCKED.test(subject + ' ' + last.getFrom())) continue;
    const heb = /[֐-׿]/.test(subject + ' ' + a.company);
    const sign = heb ? '{{NAME_HE}}' : '{{NAME_EN}}';
    const o = askGemini_([
      'Write a short follow-up email reply for {{NAME_EN}}, a job candidate. Return JSON only: {"body": "..."}',
      'Language: ' + (heb ? 'Hebrew' : 'English') + '. 3-5 sentences, human and polite, not pushy. Ask if there is an update on their application and say they are still very interested.',
      'No placeholders, no brackets, no subject line. Sign off with: ' + sign + '\n' + OWNER_PHONE,
      'Company: ' + a.company, 'Role: ' + (a.role && a.role !== 'לא צוין' ? a.role : 'not stated'), 'Applied: ' + a.applied,
      'Thread subject: ' + STRIP_PHONES(subject),
      'Their last message:\n' + STRIP_PHONES(String(last.getPlainBody() || '').slice(0, 1500)),
      'About {{FIRST_NAME_EN}} (one line at most): ' + profileGet_('שורה עליי'),
    ].join('\n'), { json: true, maxTokens: 600 });
    if (!o || !o.body) return made;   // no AI: no generic drafts
    let body = String(o.body).trim();
    if (/\[[^\]]*\]|\{\{|<[^>]+>|XXX/.test(body)) { console.warn('follow-up: placeholder in draft, skipped', a.id); continue; }
    if (body.indexOf(OWNER_PHONE) < 0) body += (body.indexOf(sign) < 0 ? '\n\n' + sign : '') + '\n' + OWNER_PHONE;   // the phone right under the signature
    th.createDraftReply(body);   // a draft only — {{FIRST_NAME_EN}} sends it themselves
    const link = threadLink_(a.thread_id);
    updateRow_(A, a.id, { followup_draft: link, next_step: 'לבדוק ולשלוח את טיוטת הפולואפ ב-Gmail', last_update: today });
    made++;
    try { ensureTask_('fu_' + a.id, 'לשלוח פולואפ – ' + a.company, 'הטיוטה מחכה ב-Gmail: ' + link, atHour_(1, 10)); }
    catch (e) { console.warn('follow-up task failed', e); }
  }
  return made;
}
