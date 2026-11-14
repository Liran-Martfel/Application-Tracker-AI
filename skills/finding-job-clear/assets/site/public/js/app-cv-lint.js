/* CV "AI-tell" linter: plain rules, no model. Used on every CV line Gemini changed (app-cv-file.js).
   Works in the browser (window.CVLint) and in node tests (loaded with vm, see test/cv-file.test.cjs). */
(function (root) {
  'use strict';
  // ---- words and phrases that make a CV read as machine-written (English) ----
  const BANNED_EN = [
    'leverage', 'leveraged', 'leverages', 'leveraging', 'spearhead', 'spearheaded', 'spearheading', 'seamless', 'seamlessly',
    'passionate', 'passion for', 'dynamic', 'cutting-edge', 'cutting edge', 'state-of-the-art', 'robust', 'synergy', 'synergies',
    'utilize', 'utilized', 'utilizes', 'utilizing', 'utilization', 'delve', 'delved', 'delving', 'innovative', 'results-driven',
    'results-oriented', 'detail-oriented', 'data-driven', 'proven track record', 'track record', 'fast-paced', 'game-changer', 'game changer',
    'game-changing', 'harness', 'harnessed', 'harnessing', 'empower', 'empowered', 'empowering', 'elevate', 'elevated', 'elevating',
    "in today's", 'in today’s', 'testament', 'pivotal', 'meticulous', 'meticulously', 'go-getter', 'team player', 'self-starter',
    'hard-working', 'hardworking', 'highly motivated', 'thrive', 'thrives', 'thriving', 'wealth of', 'tapestry', 'landscape', 'realm',
    'foster', 'fostered', 'fostering', 'holistic', 'paradigm', 'unparalleled', 'unwavering', 'commitment to excellence', 'showcase',
    'showcased', 'showcasing', 'underscore', 'underscores', 'orchestrate', 'orchestrated', 'orchestrating', 'transformative',
    'groundbreaking', 'revolutionize', 'revolutionized', 'next-level', 'deep dive', 'ever-evolving', 'ever-changing', 'myriad',
    'plethora', 'keen eye', 'strong work ethic', 'excellent communication skills', 'outside the box', 'above and beyond', 'value-add',
    'visionary', 'trailblazer', 'trailblazing', 'rockstar', 'ninja', 'guru', 'best-in-class', 'world-class', 'synergize',
    'dedicated professional', 'driven professional', 'eager to', 'excited to', 'journey', 'endeavor', 'endeavour', 'navigating the',
    'at the intersection of', 'a blend of', 'unlock', 'unlocked', 'unlocking', 'supercharge', 'supercharged', 'boasts', 'adept at',
    'well-versed', 'skilled in crafting', 'crafting', 'crafted',
  ];
  // ---- Hebrew: the stock phrases of Hebrew CVs and translated AI phrasing ----
  const BANNED_HE = [
    'בעל מוטיבציה גבוהה', 'בעלת מוטיבציה גבוהה', 'מוטיבציה גבוהה', 'יכולת למידה עצמית גבוהה', 'יכולת למידה גבוהה', 'יכולות למידה גבוהות',
    'תודעת שירות גבוהה', 'תודעת שירות', 'חשיבה מחוץ לקופסה', 'מחוץ לקופסה', 'סינרגיה', 'סינרגטי', 'מוביל שינוי', 'מובילת שינוי',
    'יחסי אנוש מצוינים', 'יחסי אנוש טובים', 'יכולות בין-אישיות גבוהות', 'יכולות בין אישיות גבוהות', 'כושר ביטוי גבוה', 'מחויבות גבוהה',
    'מוסר עבודה גבוה', 'יכולות גבוהות', 'יכולת גבוהה', 'אוריינטציה', 'חדשני', 'חדשנית', 'חדשניים', 'חדשניות', 'פורץ דרך', 'פורצת דרך',
    'מהפכני', 'מהפכנית', 'דינמי', 'דינמית', 'תשוקה', 'נלהב', 'נלהבת', 'ממוקד תוצאות', 'ממוקדת תוצאות', 'מונחה תוצאות', 'מוכוון תוצאות',
    'רב-גוני', 'רב גוני', 'שחקן נשמה', 'ראש גדול', 'מינוף', 'למנף', 'ממנף', 'מינפתי', 'הוליסטי', 'הוליסטית', 'בעידן של היום', 'בעולם של היום',
    'בעולם המשתנה', 'חוד החנית', 'פרדיגמה', 'מצוינות', 'יכולת עבודה בצוות', 'יכולת עבודה תחת לחץ', 'ידע נרחב', 'ניסיון עשיר',
    'עתיר', 'מסע', 'מקצוען אמיתי', 'איש של אנשים',
  ];
  const ADJ_EN = new Set(['creative', 'innovative', 'reliable', 'scalable', 'efficient', 'effective', 'dynamic', 'robust', 'motivated', 'dedicated',
    'passionate', 'proactive', 'responsible', 'organized', 'curious', 'driven', 'versatile', 'collaborative', 'analytical', 'strategic',
    'detail-oriented', 'hardworking', 'hard-working', 'independent', 'resourceful', 'adaptable', 'flexible', 'thorough', 'diligent',
    'professional', 'energetic', 'enthusiastic', 'committed', 'meticulous', 'accurate', 'secure', 'modern', 'intuitive', 'seamless',
    'maintainable', 'clean', 'fast', 'simple', 'elegant', 'impactful', 'meaningful', 'practical', 'hands-on', 'self-motivated']);
  const ADJ_HE = new Set(['חרוץ', 'חרוצה', 'אחראי', 'אחראית', 'יסודי', 'יסודית', 'יצירתי', 'יצירתית', 'מקצועי', 'מקצועית', 'דינמי', 'דינמית',
    'ורסטילי', 'ורסטילית', 'אמין', 'אמינה', 'מסור', 'מסורה', 'נלהב', 'נלהבת', 'סקרן', 'סקרנית', 'מוכשר', 'מוכשרת', 'יוזם', 'יוזמת',
    'עצמאי', 'עצמאית', 'ממוקד', 'ממוקדת', 'אנליטי', 'אנליטית', 'מאורגן', 'מאורגנת', 'חדשני', 'חדשנית', 'יעיל', 'יעילה', 'גמיש', 'גמישה',
    'שאפתן', 'שאפתנית', 'קפדן', 'קפדנית', 'אסטרטגי', 'אסטרטגית', 'פרואקטיבי', 'פרואקטיבית']);

  const HEB = '֐-׿';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // English: whole words; Hebrew: whole words with an optional one-letter prefix (ו, ה, ב, ל, מ, ש, כ)
  const RE_EN = BANNED_EN.map((p) => [p, new RegExp('(?<![A-Za-z])' + esc(p).replace(/[ -]/g, '[\\s-]') + '(?![A-Za-z])', 'i')]);
  const RE_HE = BANNED_HE.map((p) => [p, new RegExp('(?<![' + HEB + '])[והבלמשכ]?' + esc(p).replace(/[ -]/g, '[\\s-]') + '(?![' + HEB + '])')]);
  const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}☀-➿⭐⭕️]/u;
  // an en dash is fine only inside a range: 2018–2020, 2025–Present, 2025–היום
  const RANGE_END = /^\s*(\d|present|today|now|current|היום|כיום|הווה|עכשיו)/i;

  function triad(text, lang) {
    if (lang === 'he') {
      const m = text.match(new RegExp('([' + HEB + ']+)\\s*,\\s*([' + HEB + ']+)\\s*(?:,\\s*)?ו-?([' + HEB + ']+)'));
      if (!m) return null;
      const w = [m[1], m[2], m[3]];
      const known = w.filter((x) => ADJ_HE.has(x) || ADJ_HE.has(x.replace(/^[הו]/, ''))).length;
      const shape = w.every((x) => /(י|ית|ני|נית)$/.test(x));
      return known >= 2 || (known >= 1 && shape) ? m[0] : null;
    }
    const re = /\b([A-Za-z-]+)\s*,\s*([A-Za-z-]+)\s*,?\s*(?:and|&|or)\s+([A-Za-z-]+)\b/g;
    let m;
    while ((m = re.exec(text))) {
      const w = [m[1], m[2], m[3]].map((x) => x.toLowerCase());
      const isAdj = (x) => ADJ_EN.has(x) || /(ive|ous|ful|able|ible|ic|ent|ant)$/.test(x) && !/^[A-Z0-9]/.test(x) && x.length > 4;
      if (w.filter((x) => ADJ_EN.has(x)).length >= 2 || w.every(isAdj)) return m[0];
    }
    return null;
  }

  /** Findings for one line. lang: 'he' | 'en'. Each finding: { code, word?, msg } (msg in Hebrew for the dashboard). */
  function lintLine(text, lang) {
    const t = String(text || '');
    const out = [];
    for (const [p, re] of RE_EN) if (re.test(t)) out.push({ code: 'banned', word: p, msg: `ביטוי שנשמע כמו AI: "${p}"` });
    for (const [p, re] of RE_HE) if (re.test(t)) out.push({ code: 'banned', word: p, msg: `ביטוי שחוק: "${p}"` });
    // "מוטיבציה גבוהה" inside "בעל מוטיבציה גבוהה" is one finding, not two
    for (let i = out.length - 1; i >= 0; i--) if (out.some((o, j) => j !== i && o.word.length > out[i].word.length && o.word.toLowerCase().includes(out[i].word.toLowerCase()))) out.splice(i, 1);
    if (t.includes('—')) out.push({ code: 'em_dash', msg: 'קו ארוך (—)' });
    const en = [...t.matchAll(/–/g)].filter((m) => !(/\d\s*$/.test(t.slice(0, m.index)) && RANGE_END.test(t.slice(m.index + 1))));
    if (en.length) out.push({ code: 'en_dash', msg: 'קו בינוני (–) שמשמש כמקף משפט' });
    if (EMOJI.test(t)) out.push({ code: 'emoji', msg: 'אימוג׳י' });
    const tr = triad(t, lang);
    if (tr) out.push({ code: 'triad', word: tr, msg: `שלושה תארים ברצף: "${tr}"` });
    return out;
  }

  const words = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
  const first = (s) => (words(s)[0] || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  /** Variety in one section's bullets: not all the same length band, not all the same opening pattern. */
  function lintSection(bullets, lang) {
    const b = (bullets || []).map(String).filter((x) => x.trim());
    const out = [];
    if (b.length < 3) return out;
    const lens = b.map((x) => words(x).length);
    if (Math.max(...lens) / Math.max(1, Math.min(...lens)) <= 1.2) out.push({ code: 'same_length', msg: 'כל השורות באותו אורך בערך' });
    const f = b.map(first);
    if (f.every((x) => x && x === f[0])) out.push({ code: 'same_opening', msg: `כל השורות נפתחות ב"${f[0]}"` });
    else if (lang !== 'he' && b.every((x) => /^[A-Z][a-z]+ed\b/.test(x.trim())) && b.every((x) => /\b(by|resulting in|leading to|which (led|resulted))\b/i.test(x))) {
      out.push({ code: 'xyz_pattern', msg: 'כל השורות באותה תבנית (פועל בעבר + by)' });
    } else if (lang === 'he' && b.every((x) => /(באמצעות|על ידי|ע"י|מה שהוביל|שהוביל ל)/.test(x))) {
      out.push({ code: 'xyz_pattern', msg: 'כל השורות באותה תבנית (… באמצעות …)' });
    }
    return out;
  }

  const api = { lintLine, lintSection, BANNED_EN, BANNED_HE };
  root.CVLint = api;
})(typeof window !== 'undefined' ? window : globalThis);
