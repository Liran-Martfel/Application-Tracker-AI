// Intent: did the owner report something / ask for a change (→ Nika may propose a button), or ask, chat, practise
// (→ an answer, never a button)? A small classifier on top of a pretrained multilingual transformer:
//   1. the message → a sentence embedding (BGE-M3 on Workers AI: free, Hebrew and English, no Gemini at all);
//   2. k-nearest neighbours (cosine) against the labelled example sentences below, whose vectors are computed once
//      and kept in Nika's Durable Object;
//   3. a clear majority → the label; a close call → null, and the keyword rule (wantsChange in nika.js) decides.
// It runs next to the RAG lookup, so it adds no waiting. To teach it a new kind of sentence, add an example: the
// vectors are recomputed automatically (the cache id is a hash of the examples).

export const EMBED_MODEL = '@cf/baai/bge-m3';
const K = 7;              // neighbours that vote
const MIN_MARGIN = 0.12;  // below this share difference the call is "unsure" → the keyword rule decides

// CHANGE: a report of something that happened, or a request to change the data (update, add, remove, remind, draft)
export const CHANGE = [
  'הגשתי היום ל-Orbit Labs', 'הגשתי קורות חיים למשרה של Nimbus AI', 'שלחתי היום שלוש הגשות', 'הגשתי דרך לינקדאין ל-Quanta Systems',
  'קבעתי ראיון עם Nimbus AI ליום שלישי', 'נקבע לי ראיון שני ב-Cobalt Labs', 'יש לי ראיון מחר ב-10 עם Granite Security',
  'התקשרו אליי מ-Cobalt Labs', 'חזרו אליי מ-Zenith Aero עם תשובה חיובית', 'המגייסת של Quanta Systems התקשרה', 'דיברתי עם המגייסת של Pinewood',
  'היה לי ראיון טלפוני היום עם Granite Security', 'הראיון עבר טוב, מחכים לשלב הבא', 'היה ראיון, אמרו שיחזרו אליי בשבוע הבא',
  'בסוף לא התקבלתי ל-Vela Chips', 'קיבלתי דחייה מ-Pinewood', 'דחו אותי ב-Brightloop', 'קיבלתי הצעת עבודה!', 'עברתי לשלב הבא ב-Acme Robotics',
  'שלחתי להם את המטלה', 'סיימתי את המטלה של Acme Robotics', 'ביקשו ממני לשלוח קורות חיים מעודכנים',
  'תעדכני ש-Brightloop בתהליך', 'תסמני את Nimbus AI כנדחה', 'תשני את הסטטוס של Zenith Aero לראיון', 'תעדכני את השלב הבא ב-Orbit Labs',
  'תוסיפי הגשה ל-Brightloop, AI Engineer', 'אני רוצה לעדכן סטטוס של הגשה', 'בא לי לרשום שיחה שהייתה לי', 'תוסיפי אירוע: שיחה עם המגייסת', 'תרשמי שהראיון היה טוב',
  'תזכירי לי מחר ב-10 לשלוח פולואפ', 'תזכירי לי ביום ראשון להתקשר אליהם', 'תכיני לי טיוטת פולואפ ל-Orbit Labs',
  'תנסחי לי מייל תודה אחרי הראיון', 'תמחקי את המשרה של Pixel Harbor', 'המשרה הזאת לא רלוונטית, תורידי אותה',
  'I applied to Globex today', 'They called me from Initech', 'I got rejected by Hooli', 'Remind me tomorrow to call them',
  'Add an application for Tessera Compute', 'Mark Nimbus AI as rejected', 'Draft a follow-up email to Orbit Labs',
];

// NO_CHANGE: questions, chat, thanks, interview practice, explanations: none of them changes any data
export const NO_CHANGE = [
  'מה הסטטוס של המשרות שלי?', 'אני רוצה לדעת מה הסטטוס של המשרות שלי', 'מה מחכה לי?', 'יש משהו חדש?', 'יש תשובות חדשות?',
  'מתי הגשתי ל-Nimbus AI?', 'האם הגשתי ל-Orbit Labs?', 'האם Brightloop חזרו אליי?', 'מה קורה עם Zenith Aero?', 'מי עוד לא ענה לי?',
  'כמה הגשות פתוחות יש לי?', 'איזה ראיונות יש לי השבוע?', 'איזה משרות כדאי לי להגיש?', 'מה כתוב במשרה של Nimbus AI?',
  'מה הקשר לדחות?', 'למה הצעת את זה?', 'מה זה הכפתור הזה?', 'למה רשמת שזה נדחה?', 'למה עדכנת את הסטטוס שלהם?', 'למה את מציעה להוסיף את זה?', 'לא הבנתי, תסבירי', 'מה את יודעת לעשות?',
  'בוא נתרגל ראיון', 'תשאלי אותי שאלה על הפרויקטים שלי', 'איך כדאי לענות על שאלת חולשות?', 'תסבירי לי מה זה RAG',
  'תספרי לי על הפרויקט ShelfScan', 'תסכמי לי את השבוע', 'איך היה השבוע שלי בחיפוש?', 'מה השלב הבא אצל Brightloop?',
  'תודה!', 'היי', 'בוקר טוב', 'סבבה, הבנתי', 'מעולה', 'אוקיי',
  "What's waiting for me?", 'Did anyone reply?', "Let's practice an interview", 'When did I apply to Quanta Systems?',
  'Explain this button', 'Thanks!', 'How many applications are open?',
];

let mem = null;   // this isolate's copy of the example vectors: { id, vecs: [[...]], labels: [1|0] }

async function hashOf(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].slice(0, 6).map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Sentence vectors. EMBED_TEST_URL: the tests' fake embeddings (like GEMINI_BASE; honoured only with TEST_HOOKS=1 and
 * a local http address, as testHook in nika.js); in production Workers AI. */
export async function embed(env, texts) {
  const testUrl = String(env.EMBED_TEST_URL || '').trim();
  if (env.TEST_HOOKS === '1' && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(testUrl)) {
    const r = await fetch(testUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: texts }) });
    return (await r.json()).data;
  }
  if (!env.AI) throw new Error('no_ai');
  const out = await env.AI.run(EMBED_MODEL, { text: texts });
  return out.data;
}

// int8 with one scale per vector: 4× smaller than float32 (82 × 1024 dims ≈ 84 KB, under the 128 KB per stored value);
// the cosine between quantized vectors stays within about 0.01 of the original
export function pack(vecs) {
  const dim = vecs[0].length, q = new Int8Array(vecs.length * dim), scale = new Float32Array(vecs.length);
  vecs.forEach((v, i) => {
    const m = v.reduce((a, x) => Math.max(a, Math.abs(x)), 0) || 1;
    scale[i] = m / 127;
    for (let j = 0; j < dim; j++) q[i * dim + j] = Math.round(v[j] / scale[i]);
  });
  return { n: vecs.length, dim, q, scale };
}
export function unpack({ n, dim, q, scale }) {
  return Array.from({ length: n }, (_, i) => Array.from(q.subarray(i * dim, (i + 1) * dim), (x) => x * scale[i]));
}

const cos = (a, b) => { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return d / (Math.sqrt(x * y) || 1); };

/** The examples' vectors: this isolate's memory → Nika's Durable Object → computed once (one batch call). */
async function examples(env, store) {
  const all = [...CHANGE, ...NO_CHANGE];
  const id = 'intent-' + (await hashOf(EMBED_MODEL + '\n' + all.join('\n')));
  if (mem && mem.id === id) return mem;
  const kept = store ? await store.raw('intent').catch(() => null) : null;
  let vecs = kept && kept.id === id && kept.n === all.length ? unpack(kept) : null;
  if (!vecs) {
    vecs = await embed(env, all);
    if (store) await store.keepRaw('intent', { id, ...pack(vecs) }).catch((e) => console.error('nika: intent keep', String(e.message || e)));
  }
  mem = { id, vecs, labels: all.map((_, i) => (i < CHANGE.length ? 1 : 0)) };
  return mem;
}

/** k-NN vote on prepared vectors (exported for the offline tests). Returns { change: true|false|null, margin }. */
export function vote(q, ex, k = K) {
  const top = ex.vecs.map((v, i) => ({ s: cos(q, v), y: ex.labels[i] })).sort((a, b) => b.s - a.s).slice(0, k);
  let yes = 0, no = 0;
  // similarity⁴: the closest examples count much more than the merely related ones
  top.forEach((t) => { const w = Math.max(t.s, 0) ** 4; if (t.y) yes += w; else no += w; });
  const total = yes + no || 1, margin = Math.abs(yes - no) / total;
  return { change: margin < MIN_MARGIN ? null : yes > no, margin: Math.round(margin * 100) / 100 };
}

/** The intent of one message. store = Nika's Durable Object stub (vectors / keepVectors). Never throws. */
export async function intentOf(env, store, text) {
  try {
    const ex = await examples(env, store);
    const [q] = await embed(env, [String(text || '').slice(0, 500)]);
    return vote(q, ex);
  } catch (e) {
    console.error('nika: intent', String(e.message || e));
    return { change: null, margin: 0 };
  }
}
