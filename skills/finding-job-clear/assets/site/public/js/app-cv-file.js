/* A CV file tailored to one job: one Gemini call returns the CV as JSON, the code checks it, and the file
   (Word .docx or a print view for PDF) is built here in the browser, with no outside library.
   Rules: Gemini edits, it does not rewrite. Lines it did not change must be the owner's own lines word for word;
   a changed line may not bring a number, technology, title or date that is not in the CV, may not read as
   AI-written (app-cv-lint.js), and at most MAX_CHANGED lines change. Anything that fails goes back to the
   original line. The section order, bullet counts and the contact line are set by the code, not by the model.
   Pure functions (no DOM) so the node test can run them: window.CVFile. The dashboard wiring is in app-cv-ui.js. */
(function (root) {
  'use strict';
  const MAX_CHANGED = 8;
  const ORDER = ['summary', 'skills', 'projects', 'experience', 'education'];
  const HEADINGS = {
    en: { summary: 'Professional Summary', skills: 'Technical Skills', projects: 'Projects', experience: 'Experience', education: 'Education' },
    he: { summary: 'תקציר מקצועי', skills: 'כישורים טכניים', projects: 'פרויקטים', experience: 'ניסיון', education: 'השכלה' },
  };
  const HEB = /[֐-׿]/;
  const lint = () => root.CVLint;

  // ---------- text helpers ----------
  // what counts as "the same line": quotes, dashes, bullets and spaces don't matter
  const norm = (s) => String(s == null ? '' : s).normalize('NFC')
    .replace(/[-•●▪◦·�‎‏‪-‮]/g, ' ')
    .replace(/[‘’‚‛`´׳]/g, "'").replace(/[“”„״]/g, '"')
    .replace(/[‐-―−]/g, '-').replace(/\s*-\s*/g, '-').replace(/\s*([,;:|])\s*/g, '$1 ')
    .replace(/\s+/g, ' ').trim();
  const cmp = (s) => norm(s).replace(/[.\s]+$/, '');
  const isHebrewText = (s) => { const t = String(s || ''); const he = (t.match(/[֐-׿]/g) || []).length, en = (t.match(/[A-Za-z]/g) || []).length; return he > en * 0.5; };

  /** The CV text as numbered lines (L1, L2, …) for the model; bullet marks removed. */
  function numberLines(text) {
    return String(text || '').split(/\r?\n/).map((l) => l.replace(/^[\s-•●▪◦·\-*–—>●]+/, '').replace(/\s+/g, ' ').trim())
      .filter(Boolean).map((t, i) => ({ id: 'L' + (i + 1), text: t }));
  }

  // ---------- reading the original without the model (fallback, and the summary to fall back to) ----------
  const SECTION_RE = [
    ['summary', /summary|profile|about me|objective|תקציר|פרופיל|על עצמי|אודות|תמצית/i],
    ['skills', /skills|technolog|tools|stack|certification|languages|כישורים|מיומנויות|טכנולוגיות|כלים|הסמכות|שפות/i],
    ['projects', /project|פרויקט/i],
    ['experience', /experience|employment|work history|military|career|ניסיון|תעסוקה|שירות צבאי|צבאי/i],
    ['education', /education|training|academic|studies|השכלה|לימודים|הכשרה/i],
  ];
  function headingOf(line) {
    const t = line.trim();
    if (t.length > 60 || /[.!?]$/.test(t) || t.split(/\s+/).length > 8 || /:\s*\S/.test(t)) return null;
    for (const [k, re] of SECTION_RE) if (re.test(t)) return k;
    return null;
  }
  /** Best-effort structure of the original text (used when Gemini's answer can't be used). */
  function parseOriginal(text) {
    const raw = String(text || '').split(/\r?\n/);
    const lines = numberLines(text);
    const bulleted = new Set();
    let k = 0;
    raw.forEach((r) => { const t = r.replace(/^[\s-•●▪◦·\-*–—>●]+/, '').replace(/\s+/g, ' ').trim(); if (!t) return; if (/^\s*[-•●▪◦·\-*●>]/.test(r)) bulleted.add(lines[k].id); k++; });
    const cv = { headline: null, summary: [], skills: [], projects: [], experience: [], education: [], missing: [] };
    let sec = null, header = [];
    const L = (l) => ({ text: l.text, src: [l.id], changed: false });
    for (const l of lines) {
      const h = headingOf(l.text);
      if (h) { sec = h; continue; }
      if (!sec) { header.push(l); continue; }
      if (sec === 'summary') cv.summary.push(L(l));
      else if (sec === 'skills') cv.skills.push(L(l));
      else {
        const list = cv[sec];
        const cont = list.length && /^[a-z(]/.test(l.text) && !bulleted.has(l.id);
        if (cont) { const e = list[list.length - 1]; const last = e.bullets.length ? e.bullets[e.bullets.length - 1] : e.title; if (last) { last.text += ' ' + l.text; last.src.push(l.id); continue; } }
        if (bulleted.size && bulleted.has(l.id) && list.length) list[list.length - 1].bullets.push(L(l));
        else if (bulleted.size && !bulleted.has(l.id)) list.push({ title: L(l), bullets: [] });
        else if (!list.length) list.push({ title: null, bullets: [L(l)] });
        else list[list.length - 1].bullets.push(L(l));
      }
    }
    // the header: the line that is not the name / contacts is the headline
    const head = header.find((l) => !/@|\d{3}[-\s]?\d{3,}|github|linkedin|\|/i.test(l.text) && l.text.split(/\s+/).length <= 8);
    if (head) cv.headline = L(head);
    return cv;
  }

  // ---------- the prompt ----------
  function buildPrompt({ cvText, lang, job, ask, name }) {
    const lines = numberLines(cvText);
    const L = lang === 'he' ? 'Hebrew' : 'English';
    const system = [
      `You tailor ${name}'s CV to one job. You EDIT his CV, you do not rewrite it. The result must read like he wrote it himself.`,
      'RULES (all of them are checked by code; a line that breaks one is thrown away and his original line is used):',
      '1. Copy his own lines word for word. Change only what this job really needs: the professional summary (2-3 short sentences aimed at this job) and a few other lines (usually 3-5), plus the order of the skills. Never more than 8 changed lines in all.',
      '2. Never add a fact that is not in the CV: no new number, result, percentage, technology, tool, job title, degree, employer, date or responsibility. A keyword from the job ad may appear only if the CV already says it. If the job asks for something the CV does not show, put it in "missing" and do not add it.',
      '3. Results and numbers only where the CV already has them. Do not force every bullet into the same "did X, measured by Y, by doing Z" shape: vary length and opening like a person does.',
      '4. Military service: say what changed because of his work (impact), using only facts already in the CV.',
      '5. Plain, specific wording. Never use: leverage, spearheaded, seamless, passionate, dynamic, cutting-edge, robust, synergy, utilize, delve, innovative, results-driven, proven track record, fast-paced, game-changer, harness, empower, elevate, "in today\'s", testament, pivotal, meticulous, data-driven, foster, showcase, crafted; in Hebrew never: "בעל מוטיבציה גבוהה", "יכולת למידה עצמית גבוהה", "תודעת שירות גבוהה", "חשיבה מחוץ לקופסה", "סינרגיה", "מוביל שינוי", "חדשני", "דינמי". No em dash (—), no en dash (–) except inside a date range, no emoji, no chains of three adjectives.',
      '6. Sections (the code puts them in this order): summary, skills (grouped lines like "Languages: Python, SQL"), projects, experience (newest first), education. Latest role: 3-5 bullets. Older roles: 2-3 bullets. Projects: 1-3 bullets each. It must fit one A4 page, so leave out weaker bullets rather than adding. No contact line, address, ID number, age or marital status (the code adds the contact line).',
      `7. Write in ${L}, the language of the CV text. Keep his spelling of names, technologies and dates.`,
      '',
      'Return JSON only, in this shape:',
      '{"headline": L or null, "summary": [L, ...], "skills": [L, ...], "projects": [{"title": L, "bullets": [L, ...]}], "experience": [{"title": L, "bullets": [L, ...]}], "education": [{"title": L, "bullets": [L, ...]}], "missing": ["a job requirement the CV does not show", ...]}',
      'where L is {"text": "...", "src": ["L12"], "changed": false}.',
      '- "src": the ids of the CV lines this line comes from (a line that was wrapped may span two ids; a summary sentence lists the lines it is based on).',
      '- "changed": true only when the text is not exactly the source text.',
      '- A title is the role or project name with the place and dates, exactly as in the CV.',
    ].join('\n');
    const prompt = [
      ...(job || []),
      ask ? `What I want: ${ask}` : '',
      `CV language: ${L}`,
      '',
      'MY CV (one line per id):',
      ...lines.map((l) => `${l.id}: ${l.text}`),
    ].filter((x, i) => x !== '' || i > 0).join('\n');
    return { system, prompt, lines };
  }

  function buildFixPrompt(problems, cvText) {
    const system = 'You fix single lines of a CV. Keep every fact of the source line, add nothing new, use plain human wording, no em dash, no en dash outside a date range, no emoji, no cliché words. If a line cannot be fixed, return the source text exactly. Return JSON only: {"fixes":[{"key":"...","text":"..."}]}';
    const prompt = [
      'These changed lines broke the CV rules. Rewrite only these lines.',
      JSON.stringify(problems.map((p) => ({ key: p.key, text: p.text, source: p.old, problems: p.reasons }))),
      '',
      'The CV, for facts (nothing outside it may be added):',
      String(cvText || '').slice(0, 9000),
    ].join('\n');
    return { system, prompt };
  }

  const parseJSON = (s) => { if (s && typeof s === 'object') return s; const t = String(s || ''); try { return JSON.parse(t); } catch (e) { /* fall through */ } const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { /* none */ } } return null; };

  // ---------- the model's answer → the CV model ----------
  function asLine(x) {
    if (x == null) return null;
    if (typeof x === 'string') return x.trim() ? { text: x.trim(), src: [], changed: true } : null;
    const text = String(x.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return null;
    const src = (Array.isArray(x.src) ? x.src : x.src ? [x.src] : []).map(String).filter((s) => /^L\d+$/.test(s));
    return { text, src, changed: x.changed === true || x.changed === 'true' || x.changed === 1 };
  }
  function fromModel(data) {
    if (!data || typeof data !== 'object') return null;
    const list = (a) => (Array.isArray(a) ? a : []).map(asLine).filter(Boolean);
    const entries = (a) => (Array.isArray(a) ? a : []).map((e) => (e && typeof e === 'object' && !('text' in e) ? { title: asLine(e.title), bullets: list(e.bullets) } : { title: asLine(e), bullets: [] })).filter((e) => e.title || e.bullets.length);
    const cv = { headline: asLine(data.headline), summary: list(data.summary), skills: list(data.skills), projects: entries(data.projects), experience: entries(data.experience), education: entries(data.education), missing: (Array.isArray(data.missing) ? data.missing : []).map(String).filter(Boolean).slice(0, 8) };
    const n = cv.summary.length + cv.skills.length + cv.projects.length + cv.experience.length + cv.education.length;
    return n ? cv : null;
  }

  /** Every line of the CV model with a key, in reading order: [{ key, sec, kind, line, entry }]. */
  function walk(cv) {
    const out = [];
    if (cv.headline) out.push({ key: 'headline', sec: 'headline', kind: 'headline', line: cv.headline });
    cv.summary.forEach((l, i) => out.push({ key: `summary.${i}`, sec: 'summary', kind: 'summary', line: l }));
    cv.skills.forEach((l, i) => out.push({ key: `skills.${i}`, sec: 'skills', kind: 'skill', line: l }));
    for (const s of ['projects', 'experience', 'education']) cv[s].forEach((e, i) => {
      if (e.title) out.push({ key: `${s}.${i}.title`, sec: s, kind: 'title', line: e.title, entry: e });
      e.bullets.forEach((l, j) => out.push({ key: `${s}.${i}.b.${j}`, sec: s, kind: 'bullet', line: l, entry: e }));
    });
    return out;
  }

  // ---------- facts ----------
  const TECH = new Set(('python sql java javascript typescript node node.js react angular vue docker kubernetes k8s aws azure gcp linux git github gitlab spark kafka airflow ' +
    'tableau excel pandas numpy tensorflow pytorch keras langchain llamaindex rag llm llms nlp opencv fastapi flask django streamlit mongodb postgres postgresql mysql redis ' +
    'terraform jenkins html css c++ c# scala matlab looker snowflake bigquery databricks hadoop jira agile scrum graphql api apis microservices etl mlops devops sap ' +
    'salesforce n8n zapier openai gpt chatgpt claude gemini huggingface transformers pinecone selenium playwright cypress jest powershell bash rest sklearn scikit-learn ' +
    'svm svc cnn rnn lstm ann bert yolo xgboost lightgbm shap spacy nltk ollama copilot cursor jupyter colab render vercel cloudflare firebase supabase oracle sqlite ' +
    'power bi powerbi qa automation devsecops crm erp saas b2b ci/cd cicd tcp/ip networking cisco windows macos').split(' '));
  const TITLES_EN = ['senior', 'lead', 'leader', 'manager', 'head', 'director', 'principal', 'architect', 'chief', 'cto', 'ceo', 'vp', 'phd', 'ph.d', 'bachelor', 'master',
    'b.sc', 'bsc', 'm.sc', 'msc', 'b.a', 'm.a', 'mba', 'degree', 'certified', 'certificate', 'expert', 'specialist', 'consultant', 'founder', 'co-founder', 'owner', 'officer', 'captain', 'major', 'lieutenant'];
  const TITLES_HE = ['בכיר', 'בכירה', 'ראש צוות', 'מנהל', 'מנהלת', 'מנכ"ל', 'סמנכ"ל', 'ארכיטקט', 'תואר', 'דוקטורט', 'מומחה', 'מומחית', 'מוסמך', 'הסמכה', 'יועץ', 'מייסד', 'קצין', 'קצינה', 'סרן', 'רס"ן', 'סגן'];
  const HE_PREFIX = /^[והבלמשכ]{1,2}/;
  const latinTokens = (s) => (String(s).toLowerCase().match(/[a-z0-9][a-z0-9+#./-]*[a-z0-9+#]|[a-z0-9]/g) || []).map((t) => t.replace(/[./-]+$/, ''));

  function factIndex(origText) {
    const n = norm(origText);
    const lower = n.toLowerCase();
    const toks = new Set(latinTokens(lower));
    // the parts of compound tokens count too: "fast-api" / "fastapi", "scikit-learn" / "learn"
    [...toks].forEach((t) => t.split(/[./-]/).forEach((p) => p && toks.add(p)));
    const nums = new Set((n.match(/\d+(?:[.,]\d+)?/g) || []).map((x) => x.replace(',', '.')));
    const heWords = new Set((n.match(/[֐-׿"'׳״]+/g) || []).flatMap((w) => [w, w.replace(HE_PREFIX, '')]));
    return { lower, toks, nums, heWords, squashed: lower.replace(/[\s.-]/g, '') };
  }
  const hasTok = (idx, t) => {
    const x = t.toLowerCase().replace(/[.,]+$/, '');
    if (!x) return true;
    if (idx.toks.has(x) || idx.toks.has(x.replace(/s$/, '')) || idx.toks.has(x + 's')) return true;
    if (x.length >= 3 && idx.squashed.includes(x.replace(/[\s.-]/g, ''))) return true;   // "FastAPI" vs "Fast API"
    return false;
  };

  /** Facts in a changed line that the original CV does not have: numbers, technologies, names, titles. */
  function newFacts(text, idx, lang) {
    const t = norm(text);
    const bad = new Set();
    for (const m of t.matchAll(/\d+(?:[.,]\d+)?/g)) { const v = m[0].replace(',', '.'); if (!idx.nums.has(v)) bad.add(m[0]); }
    const re = /[A-Za-z][A-Za-z0-9+#./-]*[A-Za-z0-9+#]|[A-Za-z]/g;
    let m;
    while ((m = re.exec(t))) {
      const w = m[0].replace(/[./-]+$/, '');
      const before = t.slice(0, m.index).replace(/\s+$/, '');
      const start = !before || /[.:;!?|(•\-"]$/.test(before);
      const inner = /[A-Z]/.test(w.slice(1)) || /\d/.test(w) || /[+#]/.test(w);
      const cap = /^[A-Z]/.test(w) && !start;
      const factLike = lang === 'he' || inner || cap || TECH.has(w.toLowerCase()) || TITLES_EN.includes(w.toLowerCase());
      if (factLike && w.length > 1 && !hasTok(idx, w)) bad.add(w);
    }
    // two-word technologies that are lower-case in running text
    for (const p of ['power bi', 'machine learning', 'deep learning', 'computer vision', 'data science', 'ci/cd', 'hugging face', 'unit tests', 'project management', 'team lead'])
      if (t.toLowerCase().includes(p) && !idx.lower.includes(p)) bad.add(p);
    if (lang === 'he') {
      for (const w of TITLES_HE) {
        if (new RegExp('(^|[^֐-׿])[והבלמשכ]{0,2}' + w.replace(/"/g, '["״]') + '($|[^֐-׿])').test(t) && !idx.lower.includes(w)) bad.add(w);
      }
    }
    return [...bad];
  }

  // "edit, don't rewrite": most of the words of a changed line must already be in the CV
  const STOP_EN = new Set('the and for with from into that this then than have has had was were are been being which while when where also more most such their there over under about after before using used use per via its his her our your they them other into onto across each both only very just well'.split(' '));
  const STOP_HE = new Set('של את על עם גם כל אשר הוא היא הם הן זה זו אלה כדי בין לפי מול תוך אחרי לפני יותר מאוד רק עוד שלא אבל כמו'.split(' '));
  function novelty(text, idx, lang) {
    const t = norm(text).toLowerCase();
    const en = (t.match(/[a-z][a-z-]{3,}/g) || []).filter((w) => !STOP_EN.has(w));
    const he = (t.match(/[֐-׿"'׳״]{3,}/g) || []).map((w) => w.replace(HE_PREFIX, '')).filter((w) => w.length >= 3 && !STOP_HE.has(w));
    const stem = (w) => w.replace(/(ing|ed|es|s|ly)$/, '');
    const words = [...en, ...he];
    if (!words.length) return 0;
    const known = words.filter((w) => (HEB.test(w) ? idx.heWords.has(w) || idx.lower.includes(w) : idx.lower.includes(stem(w)) || idx.toks.has(w)));
    return 1 - known.length / words.length;
  }

  // ---------- checking a CV model against the original ----------
  /** Marks each line; returns the problems of changed lines: [{ key, sec, text, old, reasons:[en], msgs:[he] }]. */
  function check(cv, ctx) {
    const { origNorm, idx, byId, lang } = ctx;
    const items = walk(cv);
    const problems = [];
    for (const it of items) {
      const l = it.line;
      l.old = l.src.map((id) => byId.get(id)).filter(Boolean).join(' ');
      const same = cmp(l.text) && origNorm.includes(cmp(l.text));
      // "unchanged" must be his line word for word (and not a cut-down piece of it)
      if (!l.changed && (!same || (l.old && cmp(l.text).length < 0.6 * cmp(l.old).length))) l.changed = true;
      if (l.changed && l.old && cmp(l.old) === cmp(l.text)) l.changed = false;
      if (l.changed && !l.old && same && it.kind !== 'summary') l.changed = false;
      if (!l.changed) continue;
      const reasons = [], msgs = [];
      const facts = newFacts(l.text, idx, lang);
      if (facts.length) { reasons.push('new facts not in the CV: ' + facts.join(', ')); msgs.push('עובדות שלא בקורות החיים: ' + facts.join(', ')); }
      const nov = novelty(l.text, idx, lang);
      if (nov > (it.kind === 'summary' || it.kind === 'headline' ? 0.6 : 0.4)) { reasons.push('rewritten instead of edited (too many words that are not in the CV)'); msgs.push('נכתב מחדש במקום עריכה'); }
      for (const f of lint().lintLine(l.text, lang)) { reasons.push(f.code + (f.word ? ' "' + f.word + '"' : '')); msgs.push(f.msg); }
      if (it.kind === 'skill' && l.old) {
        // a skills line may be reordered or trimmed, never get new items
        const items0 = new Set(latinTokens(l.old)), extra = latinTokens(l.text).filter((x) => !items0.has(x) && !hasTok(idx, x));
        if (extra.length) { reasons.push('new skills: ' + extra.join(', ')); msgs.push('כישורים חדשים: ' + extra.join(', ')); }
      }
      if (reasons.length) problems.push({ key: it.key, sec: it.sec, text: l.text, old: l.old, reasons, msgs });
    }
    // variety, per entry (bullets of one role/project) and for the skills section: only where a changed line takes part
    const groups = [];
    for (const s of ['projects', 'experience', 'education']) cv[s].forEach((e, i) => groups.push({ sec: s, keys: e.bullets.map((_, j) => `${s}.${i}.b.${j}`), lines: e.bullets }));
    for (const g of groups) {
      if (!g.lines.some((l) => l.changed)) continue;
      for (const f of lint().lintSection(g.lines.map((l) => l.text), lang)) {
        g.lines.forEach((l, j) => {
          if (!l.changed) return;
          let p = problems.find((x) => x.key === g.keys[j]);
          if (!p) { p = { key: g.keys[j], sec: g.sec, text: l.text, old: l.old, reasons: [], msgs: [] }; problems.push(p); }
          p.reasons.push('the bullets of this entry all look alike: ' + f.code); p.msgs.push(f.msg);
        });
      }
    }
    return problems;
  }

  function applyFixes(cv, fixes) {
    const map = new Map(walk(cv).map((it) => [it.key, it.line]));
    for (const f of Array.isArray(fixes) ? fixes : []) {
      const l = map.get(String(f && f.key));
      const t = String((f && f.text) || '').replace(/\s+/g, ' ').trim();
      if (l && t) { l.text = t; l.changed = true; }
    }
  }

  /** Lines that still fail go back to the original (or are dropped when there is no original). */
  function revert(cv, keys, why, rejected) {
    const set = new Set(keys);
    const drop = new Set();
    for (const it of walk(cv)) {
      if (!set.has(it.key)) continue;
      const l = it.line;
      rejected.push({ key: it.key, sec: it.sec, text: l.text, old: l.old, why: why(it.key) });
      if (l.old) { l.text = l.old; l.changed = false; l.reverted = true; } else drop.add(l);
    }
    if (!drop.size) return;
    if (cv.headline && drop.has(cv.headline)) cv.headline = null;
    cv.summary = cv.summary.filter((l) => !drop.has(l));
    cv.skills = cv.skills.filter((l) => !drop.has(l));
    for (const s of ['projects', 'experience', 'education']) cv[s].forEach((e) => { if (e.title && drop.has(e.title)) e.title = null; e.bullets = e.bullets.filter((l) => !drop.has(l)); });
  }

  // ---------- the fixed CV rules ----------
  const yearOf = (s) => { const t = String(s || ''); if (/present|today|now|current|היום|כיום|הווה|עד היום/i.test(t)) return 9999; const ys = (t.match(/(19|20)\d{2}/g) || []).map(Number); return ys.length ? Math.max(...ys) : -1; };
  function enforce(cv, origCv, dropped) {
    const cut = (arr, max, why) => { while (arr.length > max) dropped.push({ text: arr.pop().text, why }); };
    // the same source line (or the same text) twice in one entry: keep the first
    for (const s of ['projects', 'experience', 'education']) cv[s].forEach((e) => {
      const seen = new Set();
      e.bullets = e.bullets.filter((b) => {
        const keys = [...b.src, 't:' + cmp(b.text)];
        if (keys.some((k) => seen.has(k))) { dropped.push({ text: b.text, why: 'duplicate' }); return false; }
        keys.forEach((k) => seen.add(k)); return true;
      });
    });
    {
      const seen = new Set();
      cv.skills = cv.skills.filter((l) => { const k = cmp(l.text); if (seen.has(k)) return false; seen.add(k); return true; });
    }
    // experience newest first (by the latest year in the title; ties keep the model's order)
    cv.experience = cv.experience.map((e, i) => ({ e, i, y: yearOf(e.title && e.title.text) })).sort((a, b) => (b.y - a.y) || (a.i - b.i)).map((x) => x.e);
    cv.experience.forEach((e, i) => cut(e.bullets, i === 0 ? 5 : 3, i === 0 ? 'max 5 bullets in the latest role' : 'max 3 bullets in an older role'));
    cv.projects.forEach((e) => cut(e.bullets, 3, 'max 3 bullets per project'));
    // the summary: 2-3 sentences; if nothing is left, his own summary
    if (!cv.summary.length && origCv && origCv.summary.length) cv.summary = origCv.summary.map((l) => ({ ...l, src: [...l.src] }));
    const sentences = cv.summary.map((l) => l.text).join(' ').split(/(?<=[.!?])\s+/).filter(Boolean);
    if (sentences.length > 3 && cv.summary.length > 1) cut(cv.summary, Math.max(1, cv.summary.length - (sentences.length - 3)), 'summary longer than 3 sentences');
    ['projects', 'experience', 'education'].forEach((s) => { cv[s] = cv[s].filter((e) => e.title || e.bullets.length); });
    return cv;
  }

  // one A4 page at 10.5pt: a rough count of printed lines; the print view measures the real height
  const CPL = { en: 100, he: 96 };
  const BUDGET = 56;
  function pageUnits(cv, lang) {
    const cpl = CPL[lang] || 100, ln = (s, w = cpl) => Math.max(1, Math.ceil(String(s || '').length / w));
    let u = 2 + 1.3 + (cv.headline ? 1.2 : 0);
    if (cv.summary.length) u += 1.8 + ln(cv.summary.map((l) => l.text).join(' '));
    if (cv.skills.length) u += 1.8 + cv.skills.reduce((a, l) => a + ln(l.text), 0);
    for (const s of ['projects', 'experience', 'education']) {
      if (!cv[s].length) continue;
      u += 1.8;
      cv[s].forEach((e) => { if (e.title) u += ln(e.title.text) + 0.35; e.bullets.forEach((b) => { u += ln(b.text, cpl - 5) + 0.1; }); });
    }
    return u;
  }
  function fitPage(cv, lang, dropped) {
    const steps = [
      () => { for (let i = cv.experience.length - 1; i >= 1; i--) if (cv.experience[i].bullets.length > 2) return cv.experience[i].bullets; },
      () => { for (let i = cv.projects.length - 1; i >= 0; i--) if (cv.projects[i].bullets.length > 1) return cv.projects[i].bullets; },
      () => { for (let i = cv.education.length - 1; i >= 0; i--) if (cv.education[i].bullets.length > 1) return cv.education[i].bullets; },
      () => (cv.experience[0] && cv.experience[0].bullets.length > 3 ? cv.experience[0].bullets : null),
      () => { for (let i = cv.experience.length - 1; i >= 1; i--) if (cv.experience[i].bullets.length > 1) return cv.experience[i].bullets; },
    ];
    let guard = 60;
    while (pageUnits(cv, lang) > BUDGET && guard--) {
      let arr = null;
      for (const s of steps) { arr = s(); if (arr) break; }
      if (!arr) {
        if (cv.projects.length > 2) { const e = cv.projects.pop(); dropped.push({ text: (e.title ? e.title.text : '') || (e.bullets[0] || {}).text, why: 'one page' }); continue; }
        break;
      }
      dropped.push({ text: arr.pop().text, why: 'one page' });
    }
    return pageUnits(cv, lang) <= BUDGET;
  }

  function capChanges(cv, max, rejected) {
    const changed = walk(cv).filter((it) => it.line.changed);
    if (changed.length <= max) return;
    // the summary first, then in reading order
    const keep = new Set([...changed.filter((it) => it.sec === 'summary' || it.sec === 'headline'), ...changed.filter((it) => it.sec !== 'summary' && it.sec !== 'headline')].slice(0, max).map((it) => it.key));
    revert(cv, changed.filter((it) => !keep.has(it.key)).map((it) => it.key), () => ['more than ' + max + ' changed lines'], rejected);
  }

  // ---------- the whole flow (gen is injected: window.SITE.gen in the browser, a fake in tests) ----------
  /**
   * opts: { gen(prompt, {system, json, maxTokens}) → Promise<string>, cvText, lang: 'he'|'en', job: [lines], ask, name, maxChanged }
   * → { cv, lang, changes:[{key, sec, old, text}], rejected:[{key, sec, text, old, why}], dropped:[{text, why}], missing:[], calls, fallback, fits }
   */
  async function tailor(opts) {
    const lang = opts.lang === 'he' ? 'he' : 'en';
    const { system, prompt, lines } = buildPrompt({ cvText: opts.cvText, lang, job: opts.job, ask: opts.ask, name: opts.name || '' });
    const byId = new Map(lines.map((l) => [l.id, l.text]));
    const ctx = { origNorm: cmp(lines.map((l) => l.text).join(' ')), idx: factIndex(opts.cvText), byId, lang };
    const origCv = parseOriginal(opts.cvText);
    const rejected = [], dropped = [];
    let calls = 0, retried = false, cv = null;
    const ask = async (p, s) => { calls++; return opts.gen(p, { system: s, json: true, maxTokens: 8192 }); };

    try { cv = fromModel(parseJSON(await ask(prompt, system))); } catch (e) { cv = null; }
    if (!cv) {
      // the one retry goes to a broken answer
      retried = true;
      try { cv = fromModel(parseJSON(await ask(prompt + '\n\nYour last answer was not valid JSON in the asked shape. Return only the JSON object.', system))); } catch (e) { cv = null; }
    }
    let fallback = false;
    if (!cv) { cv = origCv; fallback = true; }

    let problems = check(cv, ctx);
    if (problems.length && !retried && !fallback) {
      retried = true;
      try {
        const fp = buildFixPrompt(problems, opts.cvText);
        const j = parseJSON(await ask(fp.prompt, fp.system));
        applyFixes(cv, j && j.fixes);
      } catch (e) { /* keep the lines as they are; they are reverted below */ }
      problems = check(cv, ctx);
    }
    if (problems.length) {
      const why = new Map(problems.map((p) => [p.key, p.msgs]));
      revert(cv, problems.map((p) => p.key), (k) => why.get(k) || [], rejected);
      check(cv, ctx);   // the reverted lines are his own again
    }
    capChanges(cv, opts.maxChanged || MAX_CHANGED, rejected);
    enforce(cv, origCv, dropped);
    const fits = fitPage(cv, lang, dropped);
    const changes = walk(cv).filter((it) => it.line.changed).map((it) => ({ key: it.key, sec: it.sec, old: it.line.old, text: it.line.text }));
    return { cv, lang, changes, rejected, dropped, missing: cv.missing || [], calls, fallback, fits, origFlags: flagOriginal(origCv, lang) };
  }

  // the owner's own lines that the linter would flag: shown as a hint, never changed by the code
  function flagOriginal(origCv, lang) {
    return walk(origCv).map((it) => ({ text: it.line.text, f: lint().lintLine(it.line.text, lang).filter((f) => f.code === 'banned') })).filter((x) => x.f.length).slice(0, 6)
      .map((x) => ({ text: x.text, msgs: x.f.map((f) => f.msg) }));
  }

  /** Undo one change (the review's checkbox): the line goes back to his original text. */
  function undoChange(cv, key) {
    const it = walk(cv).find((x) => x.key === key);
    if (!it || !it.line.changed) return false;
    if (it.line.old) { it.line.undone = it.line.text; it.line.text = it.line.old; it.line.changed = false; return true; }
    return false;
  }
  function redoChange(cv, key) {
    const it = walk(cv).find((x) => x.key === key);
    if (!it || !it.line.undone) return false;
    it.line.text = it.line.undone; delete it.line.undone; it.line.changed = true; return true;
  }

  // ---------- contact line ----------
  const bare = (u) => String(u || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  /** phone, email, LinkedIn, GitHub, site: from the CV text first, then from the owner's settings. Never an address, ID, age or marital status. */
  function contactLine(cvText, me) {
    const t = String(cvText || ''), m = me || {};
    const phone = (t.match(/(?:\+972[-\s]?|0)5\d[-\s]?\d{3}[-\s]?\d{4}/) || [])[0] || m.phone || '';
    const email = m.email || (t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0] || '';
    const linkedin = (t.match(/(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/in\/[\w%-]+/i) || [])[0] || m.linkedin || '';
    const github = (t.match(/(?:https?:\/\/)?github\.com\/[\w-]+/i) || [])[0] || m.github || '';
    const site = m.site || '';
    return [phone, email, linkedin, github, site].map(bare).filter(Boolean);
  }

  // ---------- the document, as blocks (the same for Word and PDF) ----------
  function blocks(cv, o) {
    const lang = o.lang === 'he' ? 'he' : 'en', H = HEADINGS[lang];
    const out = [{ type: 'name', text: o.name }];
    if (cv.headline && cv.headline.text) out.push({ type: 'headline', text: cv.headline.text });
    out.push({ type: 'contact', text: (o.contact || []).join(' | '), parts: o.contact || [] });
    for (const s of ORDER) {
      if (s === 'summary') { if (cv.summary.length) out.push({ type: 'h', text: H.summary }, { type: 'p', text: cv.summary.map((l) => l.text).join(' ') }); continue; }
      if (s === 'skills') {
        if (!cv.skills.length) continue;
        out.push({ type: 'h', text: H.skills });
        cv.skills.forEach((l) => { const m = l.text.match(/^([^:]{2,40}):\s*(.+)$/); out.push(m ? { type: 'skill', label: m[1].trim(), text: m[2].trim() } : { type: 'p', text: l.text }); });
        continue;
      }
      if (!cv[s].length) continue;
      out.push({ type: 'h', text: H[s] });
      cv[s].forEach((e) => { if (e.title) out.push({ type: 'entry', text: e.title.text }); e.bullets.forEach((b) => out.push({ type: 'bullet', text: b.text })); });
    }
    return out;
  }

  // ---------- file names ----------
  function fileName(nameEn, company, lang, ext) {
    const clean = (s) => String(s || '').normalize('NFKC').replace(/[^\p{L}\p{N}\s-]/gu, ' ').trim().replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const who = clean(nameEn) || 'CV', co = clean(company).slice(0, 40).replace(/-$/, '');
    return `${who}-CV${co ? '-' + co : ''}-${lang === 'he' ? 'HE' : 'EN'}.${ext}`;
  }

  // ---------- DOCX: hand-built WordprocessingML in a STORE zip ----------
  const xmlEsc = (s) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  // in a Hebrew paragraph, Latin words run left-to-right and everything else is marked right-to-left
  const LATIN = /[A-Za-z0-9@](?:[A-Za-z0-9+#.&/'@_-]*[A-Za-z0-9+#])?(?:[ ,]+[A-Za-z0-9@](?:[A-Za-z0-9+#.&/'@_-]*[A-Za-z0-9+#])?)*/g;
  function runs(text, rtl, bold) {
    const r = (t, isRtl) => t ? `<w:r><w:rPr>${bold ? '<w:b/><w:bCs/>' : ''}${isRtl ? '<w:rtl/>' : ''}</w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>` : '';
    const t = String(text || '');
    if (!rtl || !HEB.test(t)) return r(t, false);
    let out = '', last = 0;
    for (const m of t.matchAll(LATIN)) {
      if (!/[A-Za-z]/.test(m[0])) continue;   // digits alone stay in the Hebrew run
      out += r(t.slice(last, m.index), true) + r(m[0], false); last = m.index + m[0].length;
    }
    return out + r(t.slice(last), true);
  }
  function docxParts(bl, o) {
    const rtl = o.lang === 'he';
    const P = (style, inner, extra = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}${rtl ? '<w:bidi/>' : ''}</w:pPr>${inner}</w:p>`;
    const body = bl.map((b) => {
      if (b.type === 'name') return P('Title', runs(b.text, rtl));
      if (b.type === 'headline') return P('Subtitle', runs(b.text, rtl));
      if (b.type === 'contact') return P('Contact', runs(b.text, rtl));
      if (b.type === 'h') return P('Heading1', runs(b.text, rtl));
      if (b.type === 'entry') return P('Heading2', runs(b.text, rtl));
      if (b.type === 'bullet') return P('ListBullet', runs(b.text, rtl), '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
      if (b.type === 'skill') return P(null, runs(b.label + ': ', rtl, true) + runs(b.text, rtl));
      return P(null, runs(b.text, rtl));
    }).join('');
    const sect = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="794" w:right="964" w:bottom="794" w:left="964" w:header="0" w:footer="0" w:gutter="0"/>${rtl ? '<w:bidi/>' : ''}</w:sectPr>`;
    const document = `${XML}<w:document ${W}><w:body>${body}${sect}</w:body></w:document>`;
    const rp = (sz, b) => `<w:rPr>${b ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
    const style = (id, name, ppr, rpr, extra = '') => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/>${extra}<w:qFormat/>${ppr}${rpr}</w:style>`;
    const styles = `${XML}<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial" w:cs="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="${rtl ? 'he-IL' : 'en-US'}" w:eastAsia="en-US" w:bidi="he-IL"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="30" w:line="247" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
      style('Title', 'Title', '<w:pPr><w:spacing w:after="20"/></w:pPr>', rp(24, true)) +
      style('Subtitle', 'Subtitle', '<w:pPr><w:spacing w:after="20"/></w:pPr>', rp(21, false)) +
      style('Contact', 'Contact', '<w:pPr><w:spacing w:after="60"/></w:pPr>', rp(20, false)) +
      style('Heading1', 'heading 1', '<w:pPr><w:keepNext/><w:spacing w:before="150" w:after="40"/><w:outlineLvl w:val="0"/></w:pPr>', rp(22, true)) +
      style('Heading2', 'heading 2', '<w:pPr><w:keepNext/><w:spacing w:before="70" w:after="20"/><w:outlineLvl w:val="1"/></w:pPr>', rp(21, true)) +
      style('ListBullet', 'List Bullet', '<w:pPr><w:numPr><w:numId w:val="1"/></w:numPr><w:spacing w:after="20"/><w:ind w:left="340" w:hanging="227"/></w:pPr>', '') +
      '</w:styles>';
    const numbering = `${XML}<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="340" w:hanging="227"/></w:pPr><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/></w:rPr></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;
    const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return [
      ['[Content_Types].xml', `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
      ['_rels/.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`],
      ['docProps/core.xml', `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEsc(o.title || '')}</dc:title><dc:creator>${xmlEsc(o.name || '')}</dc:creator><dc:language>${rtl ? 'he-IL' : 'en-US'}</dc:language></cp:coreProperties>`],
      ['word/_rels/document.xml.rels', `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/numbering" Target="numbering.xml"/></Relationships>`],
      ['word/document.xml', document],
      ['word/styles.xml', styles],
      ['word/numbering.xml', numbering],
    ];
  }

  // zip with no compression (STORE) + CRC-32
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes) { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const utf8 = (s) => new TextEncoder().encode(s);
  function zipStore(files, date) {
    const d = date || new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const chunks = [], central = [];
    let offset = 0;
    for (const [name, content] of files) {
      const nb = utf8(name), data = typeof content === 'string' ? utf8(content) : content, crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
      chunks.push(new Uint8Array(h.buffer), nb, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, nb.length, true); c.setUint16(30, 0, true); c.setUint16(32, 0, true); c.setUint16(34, 0, true); c.setUint16(36, 0, true); c.setUint32(38, 0, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), nb);
      offset += 30 + nb.length + data.length;
    }
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, offset, true);
    const all = [...chunks, ...central, new Uint8Array(e.buffer)];
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
    let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }
  const toDocx = (bl, o) => zipStore(docxParts(bl, o));

  // ---------- PDF: a print view (the browser writes a text PDF with "Save as PDF") ----------
  const htmlEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function printHtml(bl, o) {
    const rtl = o.lang === 'he', size = o.fontPt || 10.5, pad = o.padMm || [13, 16];
    const link = (p) => { const href = /@/.test(p) ? 'mailto:' + p : /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(p) ? 'https://' + p : ''; return href ? `<a href="${htmlEsc(href)}" dir="ltr">${htmlEsc(p)}</a>` : `<span dir="ltr">${htmlEsc(p)}</span>`; };
    let body = '', inList = false;
    for (const b of bl) {
      if (b.type !== 'bullet' && inList) { body += '</ul>'; inList = false; }
      if (b.type === 'name') body += `<h1>${htmlEsc(b.text)}</h1>`;
      else if (b.type === 'headline') body += `<p class="headline">${htmlEsc(b.text)}</p>`;
      else if (b.type === 'contact') body += `<p class="contact">${(b.parts || []).map(link).join(' | ')}</p>`;
      else if (b.type === 'h') body += `<h2>${htmlEsc(b.text)}</h2>`;
      else if (b.type === 'entry') body += `<p class="entry">${htmlEsc(b.text)}</p>`;
      else if (b.type === 'bullet') { if (!inList) { body += '<ul>'; inList = true; } body += `<li>${htmlEsc(b.text)}</li>`; }
      else if (b.type === 'skill') body += `<p><b>${htmlEsc(b.label)}:</b> ${htmlEsc(b.text)}</p>`;
      else body += `<p>${htmlEsc(b.text)}</p>`;
    }
    if (inList) body += '</ul>';
    const css = `@page { size: A4; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; color: #000; }
body { font-family: Arial, "Liberation Sans", Helvetica, sans-serif; font-size: ${size}pt; line-height: 1.25; -webkit-print-color-adjust: economy; }
.page { box-sizing: border-box; width: 210mm; padding: ${pad[0]}mm ${pad[1]}mm; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
h1 { font-size: 12pt; font-weight: bold; margin: 0 0 0.6mm; }
h2 { font-size: 11pt; font-weight: bold; margin: 3mm 0 0.8mm; break-after: avoid; page-break-after: avoid; }
p { margin: 0 0 0.6mm; }
.headline { margin-bottom: 0.4mm; }
.contact { margin-bottom: 1mm; }
.entry { font-weight: bold; margin-top: 1.4mm; break-after: avoid; page-break-after: avoid; }
ul { margin: 0 0 0.6mm; padding: 0; padding-inline-start: 4.5mm; }
li { margin: 0 0 0.35mm; }
a { color: inherit; text-decoration: none; }`;
    return `<!doctype html><html lang="${rtl ? 'he' : 'en'}" dir="${rtl ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${htmlEsc(o.title || '')}</title><style>${css}</style></head><body><main class="page">${body}</main></body></html>`;
  }

  root.CVFile = {
    MAX_CHANGED, ORDER, HEADINGS, norm, numberLines, parseOriginal, buildPrompt, buildFixPrompt, parseJSON, fromModel, walk, factIndex, newFacts, novelty,
    check, enforce, fitPage, pageUnits, capChanges, tailor, undoChange, redoChange, contactLine, blocks, fileName, docxParts, zipStore, crc32, toDocx,
    printHtml, isHebrewText,
  };
})(typeof window !== 'undefined' ? window : globalThis);
