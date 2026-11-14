// Held-out sentences (none of them is an example in src/intent.js): accuracy of the classifier vs the keyword rule.
const URL = process.env.EVAL_URL || 'http://127.0.0.1:8891';
const CHANGE = ['Nimbus AI חזרו אליי עם תשובה', 'קיבלתי מייל שאני עובר לשלב הבא', 'הזמינו אותי לראיון פרונטלי', 'שלחתי פולואפ ל-Orbit Labs אתמול',
  'תעדכני שנדחיתי ב-Tessera', 'סמני שהמשרה של Vela Chips נסגרה', 'ראיינו אותי היום בזום', 'המטלה נשלחה', 'תכתבי טיוטה לגיוס של Pied Piper',
  'תורידי את המשרה של Pixel Harbor מהרשימה', 'אני רוצה להוסיף הגשה חדשה', 'תזכירי לי בעוד שעתיים לבדוק את המייל', 'הם ביקשו תיק עבודות',
  'ענו לי מ-Tessera Compute שאני לא מתאים', 'עשיתי היום ראיון טכני', 'קבעו לי שיחה עם מנהל הצוות', 'שלחו לי מבחן בית',
  'I had an interview with Orbit Labs today', 'Please update Brightloop to in progress', 'הגשתי עכשיו למשרה בלינקדאין'];
const NO = ['מה המצב עם ההגשות?', 'יש עדכונים מ-Nimbus AI?', 'האם קיבלתי תשובה מ-Quanta Systems?', 'מתי היה הראיון שלי עם Brightloop?', 'כמה דחיות קיבלתי החודש?',
  'איזו חברה הכי מתאימה לי?', 'מה הכפתור הזה אומר?', 'לא הבנתי את ההצעה שלך', 'תתרגלי איתי שאלות טכניות', 'מה כדאי להגיד על הפרויקט שלי?',
  'מה את חושבת על המשרה של Zenith Aero?', 'סבבה תודה', 'לילה טוב', 'מה יש לי היום?', 'אילו משרות חדשות יש?', 'יש לי ראיון השבוע?',
  'הגשתי כבר לפיינווד?', 'Who has not answered me yet?', 'Is there anything new today?', 'למה סימנת את זה כנדחה?'];
const WORDS = /להוסיף|לעדכן|לרשום|לסמן|למחוק|להסיר|הגשתי|שלחתי|דיברתי|שוחחתי|נפגשתי|ראיינו אותי|היה לי|יש לי ראיון|קבעו|התקשר|חזרו אליי|קיבלתי|נדחיתי|דחו אותי|הזמינו אותי|עברתי|הצעת עבודה|תעדכנ|תעדכן|עדכני|תוסיפ|תוסיף|הוסיפי|תרשמ|תרשום|רשמי|תסמנ|תסמן|סמני|תמחק|מחקי|תסיר|הסירי|תורידי|תזכיר|הזכירי|תכינ|תכין|הכיני|טיוטה|טיוטת|פולואפ|תכתבי|כתבי|תנסח|נסחי|תשני|שני את|\b(applied|update|add|remind|draft|delete|remove)\b/i;
const all = [...CHANGE.map((t) => [t, true]), ...NO.map((t) => [t, false])];
const res = await (await fetch(URL, { method: 'POST', body: JSON.stringify({ text: all.map((x) => x[0]) }) })).json();
let model = 0, unsure = 0, combined = 0, words = 0;
const wrong = [];
res.forEach((r, i) => {
  const want = all[i][1], w = WORDS.test(r.text);
  if (r.change === null) unsure++; else if (r.change === want) model++;
  const final = r.change === null ? w : r.change;
  if (final === want) combined++; else wrong.push(`${want ? 'CHANGE' : 'NO    '} ← got ${final} (model ${r.change}, margin ${r.margin}, words ${w}): ${r.text}`);
  if (w === want) words++;
});
const pct = (n) => Math.round((n / all.length) * 100) + '%';
console.log(`sentences: ${all.length}\nkeywords only: ${pct(words)}\nmodel sure and right: ${pct(model)} (unsure ${unsure})\nmodel + keywords when unsure: ${pct(combined)}`);
if (wrong.length) console.log('wrong:\n  ' + wrong.join('\n  '));
