// End-to-end checks for the personal site, against a local `wrangler dev`, with a fake Gemini started here.
// 1. .dev.vars (local only, never committed):
//      GEMINI_API_KEY=test-key
//      GEMINI_BASE=http://127.0.0.1:8789
//      ADMIN_PASSWORD=test-password
//      SESSION_SECRET=local-test-secret
// 2. npx wrangler dev --port 8799 --ip 127.0.0.1      3. BASE=http://127.0.0.1:8799 node test/site.test.cjs
// Delete .dev.vars afterwards.
const http = require('http');
const { chromium } = require('playwright');
const B = process.env.BASE || 'http://127.0.0.1:8799';
const PW = process.env.ADMIN_PASSWORD || 'test-password';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';   // "Headless" is skipped by the stats as a bot
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra); } };

// fake Gemini: small fixed embeddings, and a first-person answer
const mock = http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => { body += c; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url.includes(':batchEmbedContents')) {
      const n = (JSON.parse(body || '{}').requests || []).length;
      return res.end(JSON.stringify({ embeddings: Array.from({ length: n }, (_, i) => ({ values: Array.from({ length: 8 }, (_, k) => Math.cos(i + k)) })) }));
    }
    if (req.url.includes(':generateContent')) return res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'בניתי את זה בעצמי, עם Python ו-SQL.' }] } }] }));
    res.statusCode = 404; res.end('{}');
  });
}).listen(8789, '127.0.0.1');

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[1280, 900], [390, 844]]) {
    const tag = String(w);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, userAgent: UA });
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(B + '/'); await page.waitForSelector('#ptrack .slide');
    const sw = () => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    ok(`${tag} no sideways scroll`, (await sw()) <= 0, String(await sw()));
    ok(`${tag} no {{placeholders}} left`, !/\{\{[A-Z_]+\}\}/.test(await page.content()), (await page.content()).match(/\{\{[A-Z_]+\}\}/g)?.join(' '));
    ok(`${tag} projects carousel`, (await page.locator('#ptrack .slide').count()) === (await page.locator('#prail .pchip').count()));
    ok(`${tag} projects before chat`, await page.evaluate(() => !!(document.getElementById('proj-card').compareDocumentPosition(document.getElementById('ask')) & Node.DOCUMENT_POSITION_FOLLOWING)));
    await page.fill('#q', 'מה בנית?'); await page.press('#q', 'Enter');
    await page.waitForSelector('.msg.ai, .msg.err', { timeout: 10000 });
    ok(`${tag} chat answers`, (await page.locator('.msg.ai').count()) === 1);
    ok(`${tag} Hebrew answer reads right to left`, (await page.locator('.msg.ai').getAttribute('dir')) === 'rtl');
    await page.click('.seg button[data-lang="en"]');
    ok(`${tag} English switch`, (await page.getAttribute('html', 'dir')) === 'ltr' && (await sw()) <= 0);
    ok(`${tag} footer lock leads to sign-in`, (await page.locator('footer a.owner[href="/app"]').count()) === 1);
    ok(`${tag} no page errors`, errors.length === 0, errors.join(' | '));
    await ctx.close();
  }
  // sign-in, stats, "delete my visits", my device is never counted again
  const other = await browser.newContext({ userAgent: UA + ' Visitor' }), me = await browser.newContext({ userAgent: UA + ' Owner' });
  const visit = async (ctx) => { const p = await ctx.newPage(); await p.goto(B + '/'); await p.waitForSelector('#ptrack .slide'); await p.waitForTimeout(1500); await p.close(); };
  await visit(me); await visit(other);
  const p = await me.newPage(); await p.goto(B + '/app');
  await p.fill('#pw', 'wrong'); await p.click('#go'); await p.waitForSelector('#err:not([hidden])');
  ok('wrong password refused', /לא נכונה/.test(await p.textContent('#err')));
  await p.fill('#pw', PW); await p.click('#go'); await p.waitForSelector('#vis .tile, #vis .note', { timeout: 15000 });
  const stats = async () => (await p.request.get(B + '/api/private/stats?days=7')).json();
  let s = await stats();
  ok('visits counted, mine marked', s.visits >= 2 && s.mine >= 1, JSON.stringify({ v: s.visits, mine: s.mine }));
  const before = s.visits, mine = s.mine;
  const btn = p.locator('#vis .mine-bar button'); await btn.click(); await btn.click(); await p.waitForSelector('#vis .done', { timeout: 10000 });
  s = await stats(); ok('"delete my visits" removes only mine', s.visits === before - mine && s.mine === 0, JSON.stringify({ v: s.visits, mine: s.mine }));
  await p.request.post(B + '/api/logout'); await visit(me);
  await p.goto(B + '/app'); await p.fill('#pw', PW); await p.click('#go'); await p.waitForSelector('#vis .tile, #vis .note', { timeout: 15000 });
  s = await stats(); ok('my device stays uncounted after signing out', s.visits === before - mine, String(s.visits));
  const anon = await browser.newContext();
  ok('private stats need the session', (await anon.request.get(B + '/api/private/stats')).status() === 401);
  ok('forget needs the session', (await anon.request.post(B + '/api/private/stats/forget', { data: { mine: true } })).status() === 401);
  await browser.close(); mock.close();
  console.log(`site: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
