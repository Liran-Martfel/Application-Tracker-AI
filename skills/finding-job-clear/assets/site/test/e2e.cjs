// End-to-end check of the site against test/mock-server.mjs (run: node test/mock-server.mjs & npx wrangler dev, then node test/e2e.cjs)
// wrangler dev needs --var TEST_HOOKS:1 (the fake Gemini and the other test hooks are honoured only then), see test/nika.test.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const B = process.env.BASE || 'http://127.0.0.1:8787';
// each run looks like a fresh visitor IP (local dev honours CF-Connecting-IP), so the login lockout test never blocks the next run
const IP = '198.51.100.' + (1 + Math.floor(Math.random() * 250)), LOCK_IP = '203.0.113.' + (1 + Math.floor(Math.random() * 250));
const results = []; const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
const wait = (p, ms = 15000) => p.then(() => true, () => false);
fs.mkdirSync('test/shots', { recursive: true });

(async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[1280, 900], [390, 844]]) for (const scheme of ['light', 'dark']) {
    const tag = `${w}-${scheme}`;
    // a normal browser user agent: the site ignores "HeadlessChrome" as a bot in the visitor stats
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, locale: 'he-IL', extraHTTPHeaders: { 'CF-Connecting-IP': IP }, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' + (w < 600 ? ' Mobile' : '') });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B });
    const page = await ctx.newPage(); const errs = [];
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_|net::|status of 401/.test(m.text())) errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push(String(e)));
    const sw = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    // ---- public page ----
    await page.goto(B + '/'); await page.waitForTimeout(400);
    ok(`${tag} public no h-scroll`, (await sw()) <= 0, String(await sw()));
    // visitors don't see the "My dashboard" button; the only way in is the small lock in the footer
    ok(`${tag} public: no dashboard button`, (await page.locator('#mine:visible').count()) === 0);
    ok(`${tag} public: footer lock leads to sign-in`, (await page.locator('footer a.owner[href="/app"]').count()) === 1);
    ok(`${tag} public: photo alt`, (await page.locator('.avatar img.on').getAttribute('alt')) === '{{NAME_EN}}');
    ok(`${tag} public: photo size`, Math.round((await page.locator('.avatar').boundingBox()).width) === (w <= 640 ? 96 : 140));
    ok(`${tag} public: skills line not split`, (await page.textContent('.sub .skills')).trim() === '{{TOP_SKILLS}}');
    ok(`${tag} public: preview tags`, (await page.locator('meta[property="og:image"]').getAttribute('content')).endsWith('/og.png') && (await page.locator('meta[name="description"]').count()) === 1);
    ok(`${tag} public: where`, (await page.textContent('.pills')).includes('{{WHERE_HE}}'));
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // slate and copper, always light: the same page background in light and dark system mode
    ok(`${tag} public: theme`, bg === 'rgb(236, 234, 232)', bg);
    await page.screenshot({ path: `test/shots/public-${tag}.png`, fullPage: true });
    await page.locator('details.menu summary', { hasText: 'מייל' }).click();
    const mailLinks = await page.locator('details.menu[open] .menu-list a').evaluateAll((as) => as.map((a) => a.href));
    ok(`${tag} public: email menu (Gmail + mailto)`, mailLinks.some((h) => h.startsWith('https://mail.google.com/') && h.includes('{{EMAIL_URLENCODED}}') || h.includes('{{EMAIL}}')) && mailLinks.some((h) => h.startsWith('mailto:')));
    ok(`${tag} public: email menu inside screen`, (await sw()) <= 0, String(await sw()));
    await page.screenshot({ path: `test/shots/public-menu-${tag}.png` });
    await page.keyboard.press('Escape');
    ok(`${tag} public: Escape closes menu`, (await page.locator('details.menu[open]').count()) === 0);
    await page.locator('details.menu summary', { hasText: 'קורות חיים' }).click();
    const cvLinks = await page.locator('details.menu[open] .menu-list a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    ok(`${tag} public: CV menu`, cvLinks.includes('/cv/{{CV_FILE_PREFIX}}HE.pdf') && cvLinks.includes('/cv/{{CV_FILE_PREFIX}}EN.pdf'));
    ok(`${tag} public: CV menu inside screen`, (await sw()) <= 0, String(await sw()));
    await page.keyboard.press('Escape');
    if (scheme === 'light' && w > 600) {
      // an anonymous visitor: asks the chat, scrolls to the end, downloads the Hebrew CV
      await page.fill('#q', 'מה הפרויקטים של {{FIRST_NAME_HE}}?'); await page.press('#q', 'Enter'); await page.waitForSelector('.msg.ai', { timeout: 10000 });
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(6000);
      await page.locator('details.menu summary', { hasText: 'קורות חיים' }).click();
      await Promise.all([page.waitForEvent('download').catch(() => {}), page.locator('details.menu[open] a[href$="-HE.pdf"]').click()]);
      await page.waitForTimeout(800);
    }
    if (scheme === 'light' && w < 600) {
      // option B for the second row: a phone button instead of WhatsApp (screenshot only)
      await page.evaluate(() => { const a = document.getElementById('wa'); a.href = 'tel:+{{PHONE_INTL}}'; a.querySelector('span').textContent = 'טלפון'; });
      await page.locator('header').screenshot({ path: `test/shots/public-option-phone-${tag}.png` });
      await page.reload(); await page.locator('header').screenshot({ path: `test/shots/public-option-whatsapp-${tag}.png` });
    }

    await page.goto(B + '/app'); ok(`${tag} /app w/o cookie → login`, await page.locator('#pw').isVisible());
    await page.fill('#pw', 'correct-horse'); await page.click('#go');
    ok(`${tag} dashboard loads`, await wait(page.waitForSelector('.jt-apps tbody tr[data-key]', { timeout: 15000 })));
    await page.waitForTimeout(600);
    if (scheme === 'light' && w > 600) {
      const visits = async () => { await page.waitForFunction(() => document.querySelector('#vis-body .jt-vis-tile b, #vis-body .jt-empty'), null, { timeout: 10000 }); return Number(await page.locator('#vis-body .jt-vis-tile b').first().textContent().catch(() => '0')); };
      const n1 = await visits(), vt = await page.textContent('#vis-body');
      ok(`${tag} visitors: anonymous visit counted`, n1 >= 1, String(n1));
      ok(`${tag} visitors: chat question listed`, vt.includes('מה הפרויקטים של {{FIRST_NAME_HE}}?'));
      const row = await page.locator('#vis-body tbody tr').first().locator('td').allTextContents();
      ok(`${tag} visitors: time, depth and end of page recorded`, row[1] !== '0:00' && row[2] !== '0%' && row[3].includes('סוף הדף') && row[4].includes('קורות חיים בעברית'), row.join(' | '));
      await page.locator('#visitors').screenshot({ path: `test/shots/visitors-${tag}.png` });
      await page.goto(B + '/'); await page.waitForTimeout(1500); await page.goto(B + '/app'); await page.waitForSelector('.jt-apps tbody tr[data-key]');
      ok(`${tag} visitors: my own visit is not counted`, (await visits()) === n1);
    }

    // every section has rows, charts are drawn
    const n = (sel) => page.locator(sel).count();
    ok(`${tag} today line`, (await page.locator('#today .dash-skeleton').count()) === 0 && /\d/.test(await page.textContent('#today')), (await page.textContent('#today')).trim().replace(/\s+/g, ' ').slice(0, 90));
    ok(`${tag} last run shown`, (await page.textContent('#last-run')).includes('עדכן'));
    ok(`${tag} KPIs at the top: open / response / week / waiting`, (await n('#kpis .jt-kpi')) === 4 && (await page.evaluate(() => document.getElementById('kpis').getBoundingClientRect().top < document.getElementById('cv').getBoundingClientRect().top)));
    ok(`${tag} no load error`, await page.locator('#load-error').isHidden());
    ok(`${tag} KPIs filled`, (await page.textContent('#kpis [data-field="total"]')).trim() === '40');
    // 40 in the data; the one marked relevant FALSE (archived) has its own "ארכיון" chip
    ok(`${tag} all applications (archived left out)`, (await n('.jt-apps tbody tr[data-key]')) === 39, String(await n('.jt-apps tbody tr[data-key]')));
    await page.locator('.jt-app-chips .jt-chip', { hasText: 'ארכיון' }).click();
    ok(`${tag} "ארכיון" chip → the archived application`, (await n('.jt-apps tbody tr[data-key]')) === 1, String(await n('.jt-apps tbody tr[data-key]')));
    await page.locator('.jt-app-chips .jt-chip', { hasText: 'הכל' }).click();
    ok(`${tag} replies rows`, (await n('.jt-replies tbody tr[data-key]')) > 0);
    ok(`${tag} live mail state`, (await page.textContent('.jt-live-text')).includes('מעודכן'), await page.textContent('.jt-live-text'));
    ok(`${tag} archive rows`, (await n('.jt-arch tbody tr[data-key]')) > 0, String(await n('.jt-arch tbody tr[data-key]')));
    ok(`${tag} follow-ups rows`, (await n('.jt-followups tbody tr[data-key]')) > 0);
    ok(`${tag} weekly goal`, (await page.textContent('.jt-goal-target')).trim() === '5' && (await page.textContent('.jt-goal-msg')).length > 0);
    ok(`${tag} prep cards`, (await n('.jt-prep-item')) > 0);
    ok(`${tag} leads rows + apply buttons`, (await n('.jt-leads tbody tr[data-key]')) === 2 && (await n('.jt-leads .jt-apply')) === 2);
    ok(`${tag} job feed`, (await n('#feed .jt-feed-list li')) > 0 && (await page.textContent('#feed')).includes('חדש'));
    ok(`${tag} charts: status bars, no company/channel/cv`, (await n('#by-status .jt-bar')) === 5 && (await n('#by-company, #by-channel, #by-cv')) === 0);
    ok(`${tag} chart: weekly svg`, (await n('#weekly svg rect')) > 3);
    await page.click('#insights summary');
    ok(`${tag} what works: level/origin + speed`, (await n('#by-level .jt-bar')) > 0 && (await n('#by-origin .jt-bar')) > 0 && /\d/.test(await page.textContent('#speed-card [data-field="avg_days"]')));
    await page.click('#audit-details summary');
    ok(`${tag} audit finds the duplicates`, await wait(page.waitForFunction(() => { const t = document.getElementById('audit-body').textContent; return /אירועים כפולים \(1\)/.test(t) && /הגשות כפולות \([1-9]/.test(t) && /אותו מייל \(1\)/.test(t); }, null, { timeout: 10000 })), (await page.textContent('#audit-body')).replace(/\s+/g, ' ').slice(0, 160));
    ok(`${tag} no h-scroll`, (await sw()) <= 0, String(await sw()));
    await page.screenshot({ path: `test/shots/app-${tag}.png`, fullPage: true });

    if (scheme === 'light') {
      // search + chips
      await page.fill('.jt-app-search', 'Acme Robotics');
      const names = await page.locator('.jt-apps tbody td.jt-company').allTextContents();
      ok(`${tag} search`, names.length > 0 && names.every((x) => x.includes('Acme Robotics')), names.join(','));
      await page.fill('.jt-app-search', '');
      await page.locator('.jt-app-chips .jt-chip', { hasText: 'נדחה' }).click();
      const st = await page.locator('.jt-apps tbody .jt-pill').allTextContents();
      ok(`${tag} status chip`, st.length > 0 && st.every((x) => x === 'נדחה'));
      await page.locator('.jt-app-chips .jt-chip', { hasText: 'הכל' }).click();
      await page.click('.jt-apps th button[data-sort="company"]');
      const cos = await page.locator('.jt-apps tbody td.jt-company').allTextContents();
      ok(`${tag} sort by company`, cos.length > 1 && cos.every((c, i) => i === 0 || cos[i - 1].localeCompare(c, 'he') <= 0));
      await page.locator('.jt-rep-chips .jt-chip').first().click();
      ok(`${tag} replies chips`, (await n('.jt-replies tbody tr[data-key]')) > 0);

      // follow-ups: one already sent from Gmail, one draft
      ok(`${tag} follow-up ✓ sent (live)`, (await page.textContent('.jt-followups')).includes('✓ שלחת פולואפ'));
      const fb = page.locator('.jt-followups button', { hasText: 'ליצור טיוטה' }).first();
      ok(`${tag} follow-up button`, (await fb.count()) > 0);
      if (await fb.count()) { await fb.click(); ok(`${tag} follow-up → draft`, await wait(page.waitForSelector('.jt-followups a:has-text("טיוטה מוכנה")', { timeout: 10000 }))); }

      // CV card: upgrade + apply
      const opt = await page.locator('#cv-target option[value^="a:app-04"]').getAttribute('value');
      await page.selectOption('#cv-target', opt);
      // CV file for the job: the fake Gemini's first answer has an AI-sounding line and a new fact ("Docker"),
      // so the page sends one fix-up call, keeps the fixed line, throws the new fact away, and shows only the changed lines
      const mlog = async () => (await (await fetch(`http://127.0.0.1:${process.env.MOCK_PORT || 8788}/__log`)).json()).filter((x) => x.gemini);
      const g0 = (await mlog()).length;
      await page.click('#cv-go');
      ok(`${tag} CV file → review`, await wait(page.waitForSelector('#cv-review:not([hidden]) .jt-cv-changes li', { timeout: 15000 })));
      const cvCalls = (await mlog()).slice(g0);
      ok(`${tag} CV file: one answer + one lint retry`, cvCalls.length === 2 && /^You tailor/.test(cvCalls[0].sys) && /^You fix single lines/.test(cvCalls[1].sys) && cvCalls.every((x) => x.json), JSON.stringify(cvCalls.map((x) => x.sys.slice(0, 20))));
      const newLines = await page.locator('#cv-review .jt-cv-new').allTextContents();
      ok(`${tag} CV file: retry fixed the AI-tell, new fact rejected`, newLines.some((t) => t.includes('וזמן הכניסה לתפקיד ירד')) && !newLines.some((t) => /חדשנית|Docker/.test(t)) && (await page.textContent('#cv-review details')).includes('Docker'), newLines.join(' / '));
      ok(`${tag} CV file: only changed lines, old → new`, newLines.length === 4 && (await page.locator('#cv-review .jt-cv-old').count()) === 3, String(newLines.length));
      ok(`${tag} CV file: his own cliché flagged`, (await page.textContent('#cv-review')).includes('בעל מוטיבציה גבוהה'));
      ok(`${tag} CV file: no h-scroll`, (await sw()) <= 0, String(await sw()));
      await page.locator('#cv-review').screenshot({ path: `test/shots/cv-review-${tag}.png` });
      // Word: a real .docx (STORE zip), named after the company, with the changed line; an unticked change is left out
      await page.locator('#cv-review .jt-cv-changes li').first().locator('input').uncheck();
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('#cv-review button', { hasText: 'הורדה כ-Word' }).click()]);
      const docx = fs.readFileSync(await dl.path());
      ok(`${tag} CV file: Word download`, /-CV-Amitim-AI-HE\.docx$/.test(dl.suggestedFilename()) && docx.subarray(0, 2).toString() === 'PK' && docx.includes('word/document.xml') && docx.includes(Buffer.from('וזמן הכניסה לתפקיד ירד')), dl.suggestedFilename());
      ok(`${tag} CV file: unticked change not in the file`, !docx.includes(Buffer.from('עם פיתוח מערכות למידת מכונה')) && docx.includes(Buffer.from('<w:bidi/>')));
      // a copy of exactly that file goes to Drive (Api.gs save_cv) and the note links to it
      await page.waitForFunction(() => /נשמר ב-Drive/.test(document.querySelector('#cv-review').textContent), null, { timeout: 8000 }).catch(() => {});
      const saves = (await (await fetch(`http://127.0.0.1:${process.env.MOCK_PORT || 8788}/__log`)).json()).filter((x) => x.action === 'save_cv');
      const last = saves.at(-1) || {};
      ok(`${tag} CV file: Word copy saved to Drive`, last.file_name === dl.suggestedFilename() && Buffer.from(last.b64 || '', 'base64').equals(docx) && last.company === 'Amitim AI', { n: saves.length, name: last.file_name });
      ok(`${tag} CV file: Drive link shown`, !!(await page.$('#cv-review a[href="https://drive.google.com/file/d/mock-cv"]')));
      // PDF: the print view (caught before the print dialog)
      await page.evaluate(() => { window.__printed = ''; window.CVFile.print = (w) => { window.__printed = w.document.documentElement.outerHTML; }; });
      await page.locator('#cv-review button', { hasText: 'הורדה כ-PDF' }).click();
      ok(`${tag} CV file: PDF print view`, await wait(page.waitForFunction(() => window.__printed.length > 500, null, { timeout: 5000 })));
      const ph = await page.evaluate(() => window.__printed);
      ok(`${tag} CV file: print view RTL, A4, projects before experience, no address`, ph.includes('dir="rtl"') && ph.includes('size: A4') && ph.indexOf('<h2>פרויקטים</h2>') > 0 && ph.indexOf('<h2>פרויקטים</h2>') < ph.indexOf('<h2>ניסיון</h2>') && !ph.includes('תל אביב') && !/<script/i.test(ph));
      await page.click('#cv-apply');
      ok(`${tag} CV apply → email`, await wait(page.waitForFunction(() => { const s = document.querySelector('.jt-sheet'); return s && !s.hidden && s.querySelector('textarea').value.includes('קורות החיים מצורפים'); }, null, { timeout: 10000 })));
      ok(`${tag} CV apply → recipient = direct_contact`, (await page.locator('.jt-sheet input[type="email"]').inputValue()) === 'jobs@amitimai.example');
      ok(`${tag} CV apply → attach note`, (await page.textContent('.jt-sheet')).includes('לצרף את קובץ קורות החיים בטיוטה ב-Gmail'));
      await page.screenshot({ path: `test/shots/cv-sheet-${tag}.png` });
      // the main button opens Gmail's compose window with the email ready, to attach the CV
      // (the address is caught before it opens: the test browser is not signed in to Google)
      await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });
      await page.locator('.jt-sheet button', { hasText: 'פתיחה ב-Gmail' }).click();
      const composeUrl = (await page.evaluate(() => window.__opened[0])) || '';
      ok(`${tag} CV apply → Gmail compose with to, subject and body`, /^https:\/\/mail\.google\.com\/mail\/\?/.test(composeUrl) && composeUrl.includes('view=cm') && composeUrl.includes('to=jobs%40amitimai.example') && /su=[^&]+/.test(composeUrl) && /body=[^&]+/.test(composeUrl), composeUrl.slice(0, 120));
      await page.locator('.jt-sheet button', { hasText: 'שמירה כטיוטה' }).click();
      ok(`${tag} CV apply → create_draft`, await wait(page.waitForSelector('.jt-sheet :text("נשמרה ב-Gmail")', { timeout: 10000 })));
      await page.locator('.jt-sheet button', { hasText: 'סגירה' }).click();
      await page.locator('.jt-leads .jt-apply').first().click();
      ok(`${tag} lead "הגש" opens sheet`, await wait(page.waitForFunction(() => !document.querySelector('.jt-sheet').hidden && document.querySelector('.jt-sheet h3').textContent.includes('הגשה ל-'), null, { timeout: 5000 })));
      await page.keyboard.press('Escape');

      // the chat panel is Nika (POST /api/private/nika, the same assistant and conversation as on Telegram):
      // approve card, editable draft card, interview practice, settings
      await page.click('.ja-fab');
      // the phone run comes after the desktop run: its conversation is already there (it lives with Nika, not in the browser)
      if (w < 600) ok(`${tag} agent shows the shared conversation`, await wait(page.waitForFunction(() => document.querySelector('.ja-body').textContent.includes('דיברתי היום בטלפון עם Acme Robotics'), null, { timeout: 8000 })));
      ok(`${tag} agent is Nika`, (await page.textContent('.ja-head h3')).includes('ניקה') && (await page.textContent('.ja-welcome')).includes('אני ניקה'));
      await page.fill('.ja-ask textarea', 'דיברתי היום בטלפון עם Acme Robotics'); await page.press('.ja-ask textarea', 'Enter');
      ok(`${tag} agent answers`, await wait(page.waitForSelector('.ja-card', { timeout: 15000 })));
      const body = await page.textContent('.ja-body');
      ok(`${tag} agent phone stripped`, !body.includes('050-1234567'));
      ok(`${tag} agent disallowed action filtered`, (await n('.ja-card')) === 1);
      ok(`${tag} agent card names the application`, (await page.textContent('.ja-card b')).includes('עדכון הגשה: Acme Robotics'), await page.textContent('.ja-card b'));
      await page.locator('.ja-card .ja-btn', { hasText: 'לאשר ולעדכן' }).click();
      ok(`${tag} agent approve`, await wait(page.waitForSelector('.ja-card :text("עודכן בדשבורד")', { timeout: 10000 })));
      ok(`${tag} agent approve: buttons stay off (runs once)`, await page.locator('.ja-card .ja-btn', { hasText: 'לאשר ולעדכן' }).isDisabled());
      await page.fill('.ja-ask textarea', 'תנסחי לי מייל פולואפ ל-Acme Robotics'); await page.press('.ja-ask textarea', 'Enter');
      ok(`${tag} agent email card`, await wait(page.waitForSelector('.ja-card:has-text("טיוטת מייל")', { timeout: 10000 })));
      await page.locator('.ja-card:has-text("טיוטת מייל") input[aria-label="נושא"]').fill('פולואפ ערוך מהדשבורד');
      await page.locator('.ja-card:has-text("טיוטת מייל") .ja-btn', { hasText: 'טיוטה ב-Gmail' }).click();
      ok(`${tag} agent email → draft`, await wait(page.waitForSelector('.ja-card :text("נשמרה ב-Gmail")', { timeout: 10000 })));
      // the model's text is shown as text: HTML in a reply never becomes markup
      await page.fill('.ja-ask textarea', 'מחקי את המשרה הראשונה'); await page.press('.ja-ask textarea', 'Enter');
      // (the last bubble: the shared conversation shown on opening may already hold an older answer like it)
      await page.waitForFunction(() => { const m = [...document.querySelectorAll('.ja-msg.ai')].pop(); return m && !m.querySelector('.ja-typing') && m.textContent.includes('<b>בכפתור</b>'); }, null, { timeout: 10000 }).catch(() => {});
      ok(`${tag} agent reply is text, not HTML`, await page.evaluate(() => { const m = [...document.querySelectorAll('.ja-msg.ai')].pop(); return !!m && m.firstElementChild.textContent.includes('<b>בכפתור</b>') && !m.firstElementChild.querySelector('b'); }), await page.evaluate(() => [...document.querySelectorAll('.ja-msg')].slice(-3).map((m) => m.className + ': ' + m.innerHTML.slice(0, 160)).join(' || ')));
      await page.screenshot({ path: `test/shots/agent-${tag}.png` });
      await page.locator('.ja-tab', { hasText: 'תרגול ראיון' }).click();
      await page.waitForFunction(() => document.querySelector('.ja-practice select').options.length > 0 && document.querySelector('.ja-practice select').value);
      await page.locator('.ja-btn', { hasText: 'להתחיל ראיון' }).click();
      ok(`${tag} interview practice`, await wait(page.waitForSelector('.ja-msg.ai:has-text("שאלה ראשונה")', { timeout: 10000 })));
      await page.screenshot({ path: `test/shots/practice-${tag}.png` });
      await page.click('.ja-ib[aria-label^="הגדרות"]');
      ok(`${tag} settings: CV read-only`, (await n('.ja-settings textarea[readonly]')) === 2);
      await page.screenshot({ path: `test/shots/settings-${tag}.png` });
      await page.click('.ja-ib[aria-label^="הגדרות"]');
      if (w < 600) { const box = await page.locator('.ja-panel').boundingBox(); ok(`${tag} agent fullscreen`, box.width >= 389 && box.height >= 800, JSON.stringify(box)); }
      ok(`${tag} agent no h-scroll`, (await sw()) <= 0);
      await page.click('.ja-ib[aria-label="סגירה"]');
      await page.click('#logout'); await page.waitForURL(B + '/');
      await page.goto(B + '/app'); ok(`${tag} logout`, await page.locator('#pw').isVisible());
    }
    ok(`${tag} no console errors`, errs.length === 0, errs.join(' | ').slice(0, 300));
    await ctx.close();
  }
  // static files: robots, icons, preview image, security headers
  const robots = await (await fetch(B + '/robots.txt')).text();
  ok('robots.txt blocks /app and /api/', robots.includes('Disallow: /app') && robots.includes('Disallow: /api/'));
  for (const f of ['/favicon.svg', '/apple-touch-icon.png', '/og.png', '/cv/{{CV_FILE_PREFIX}}HE.pdf', '/cv/{{CV_FILE_PREFIX}}EN.pdf']) ok(`static ${f}`, (await fetch(B + f)).status === 200);
  for (const f of ['/', '/profile-1.jpg', '/app']) {
    const h = (await fetch(B + f)).headers;
    ok(`headers ${f}`, h.get('x-content-type-options') === 'nosniff' && h.get('x-frame-options') === 'DENY' && /default-src 'self'/.test(h.get('content-security-policy') || '') && !!h.get('permissions-policy') && !!h.get('referrer-policy'));
    ok(`headers ${f}: HSTS + COOP`, /max-age=\d+/.test(h.get('strict-transport-security') || '') && h.get('cross-origin-opener-policy') === 'same-origin');
  }
  // the dashboard code stays private, also behind an encoded or doubled path
  for (const f of ['/js/%61pp-1.js', '/js//app-1.js', '/js/%2561pp-1.js']) ok(`dashboard code private: ${f}`, (await fetch(B + f)).status === 404);
  // the session cookie: __Host- prefix; the old "s" cookie name opens nothing; logout clears both
  const login = (ip, extraH = {}, password = 'correct-horse') => fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...extraH }, body: JSON.stringify({ password }) });
  const setCookies = (r) => (typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || '']);
  const sc = setCookies(await login(IP));
  const sess = (sc.find((c) => c.startsWith('__Host-s=')) || '').split(';')[0], dev = (sc.find((c) => c.startsWith('__Host-d=')) || '').split(';')[0];
  ok('session cookie is __Host-s (Secure, HttpOnly, SameSite=Strict, Path=/)', !!sess && /Secure/.test(sc[0]) && /HttpOnly/.test(sc[0]) && /SameSite=Strict/.test(sc[0]) && /Path=\//.test(sc[0]) && !/Domain=/i.test(sc[0]), sc.join(' | '));
  ok('a trusted-device cookie is set too (long-lived)', !!dev && Number((/Max-Age=(\d+)/.exec(sc.find((c) => c.startsWith('__Host-d=')) || '') || [])[1]) > 300 * 86400);
  const ver = (c) => fetch(B + '/api/private/version', { headers: { Cookie: c } });
  ok('the session opens the private API', (await ver(sess)).status === 200);
  ok('the same value under the old cookie name "s" → 401', (await ver('s=' + sess.split('=').slice(1).join('='))).status === 401);
  const lo = setCookies(await fetch(B + '/api/logout', { method: 'POST', headers: { Cookie: sess } }));
  ok('logout clears __Host-s and the old "s"', lo.some((c) => /^__Host-s=;.*Max-Age=0/.test(c)) && lo.some((c) => /^s=;.*Max-Age=0/.test(c)), lo.join(' | '));
  const cookieAge = async (remember) => (/Max-Age=(\d+)/.exec((await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': IP }, body: JSON.stringify({ password: 'correct-horse', remember }) })).headers.get('set-cookie') || '') || [])[1];
  ok('session 12h without "remember me"', (await cookieAge(false)) === '43200');
  ok('session 30 days with "remember me"', (await cookieAge(true)) === '2592000');
  ok('audit needs the session', (await (await fetch(B + '/api/private/audit')).json()).error === 'unauthorized');
  // machine feed for Apps Script: only the X-Feed-Token header opens it, a session cookie does not
  const FEED = B + '/api/feed/activity?since=' + (Date.now() - 60000), FIP = '192.0.2.' + (1 + Math.floor(Math.random() * 250));
  const feed = (h = {}) => fetch(FEED, { headers: { 'CF-Connecting-IP': FIP, ...h } });
  ok('feed: 401 without a token', (await feed()).status === 401);
  ok('feed: 401 with a wrong token', (await feed({ 'X-Feed-Token': 'test-tokem' })).status === 401);
  // the feed has its own token: the dashboard's Apps Script token no longer opens it
  ok('feed: 401 with the dashboard token', (await feed({ 'X-Feed-Token': 'test-token' })).status === 401);
  const adminCookie = ((await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': FIP }, body: JSON.stringify({ password: 'correct-horse' }) })).headers.get('set-cookie') || '').split(';')[0];
  ok('feed: 401 with only the session cookie', (await feed({ Cookie: adminCookie })).status === 401);
  const fsid = 'feed' + Math.random().toString(36).slice(2, 12), UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const t = (body) => fetch(B + '/api/t', { method: 'POST', headers: { 'CF-Connecting-IP': FIP, 'User-Agent': UA }, body: JSON.stringify({ sid: fsid, ...body }) });
  await t({ e: 'view', ref: 'https://www.linkedin.com/feed', lang: 'he' }); await new Promise((r) => setTimeout(r, 300));
  await t({ e: 'click', what: 'cv-he' }); await t({ e: 'click', what: 'whatsapp' });
  let act = null, r0 = null;
  for (let i = 0; i < 10 && !(act && act.cv.length); i++) { await new Promise((r) => setTimeout(r, 300)); r0 = await feed({ 'X-Feed-Token': process.env.FEED_TOKEN || 'test-feed-token' }); act = await r0.json(); }
  ok('feed: right token → 200, no-store', r0.status === 200 && r0.headers.get('cache-control') === 'no-store');
  const mine = (act.cv || []).find((c) => c.which === 'he' && c.ref === 'linkedin.com');
  ok('feed: the cv-he download is listed with where it came from', !!mine && mine.device === 'מחשב' && act.visits >= 1, JSON.stringify(act).slice(0, 300));
  ok('feed: the WhatsApp click is a contact', (act.contacts || []).some((c) => c.what === 'whatsapp'));
  ok('feed: small and without IPs', act.cv.length + act.contacts.length + act.questions.length <= 50 && !/192\.0\.2\./.test(JSON.stringify(act)) && !!mine && act.until >= mine.at);
  // login limit: 5 wrong passwords per 10 minutes, the 6th is refused (runs last: it locks this IP)
  const tries = [];
  for (let i = 0; i < 6; i++) tries.push((await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': LOCK_IP }, body: JSON.stringify({ password: 'wrong-' + i }) })).status);
  ok('login: 5 wrong → 401, 6th → 429', tries.slice(0, 5).every((s) => s === 401) && tries[5] === 429, tries.join(','));
  // a device that signed in before keeps its own count: the blocked network does not lock it out
  ok('login: a trusted device on the blocked network still signs in', (await login(LOCK_IP, { Cookie: dev })).status === 200);
  ok('login: …but a forged device cookie does not help', (await login(LOCK_IP, { Cookie: '__Host-d=99999999999999.abc' })).status === 429);
  // IPv6: the whole /64 is one network (a phone or a home can use any address in it)
  const v6 = '2001:db8:' + (1 + Math.floor(Math.random() * 60000)).toString(16) + ':' + (1 + Math.floor(Math.random() * 60000)).toString(16), six = [];
  for (let i = 0; i < 6; i++) six.push((await login(`${v6}::${(i + 1).toString(16)}`, {}, 'wrong-' + i)).status);
  ok('login: IPv6 counted per /64 (5 addresses, then the 6th is blocked)', six.slice(0, 5).every((s) => s === 401) && six[5] === 429, six.join(','));
  // the public chat's daily budget (a small test counter, TEST_HOOKS only): after it, matching passages without a model call
  const budget = 'e2e' + Math.random().toString(36).slice(2, 10) + ':1';
  const chat = () => fetch(B + '/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.' + (1 + Math.floor(Math.random() * 250)), 'X-Test-Chat-Budget': budget }, body: JSON.stringify({ question: 'What projects did you build?' }) }).then((r) => r.json());
  const c1 = await chat();
  const g0 = (await (await fetch(`http://127.0.0.1:${process.env.MOCK_PORT || 8788}/__log`)).json()).filter((x) => x.gemini).length;
  const c2 = await chat();
  const g1 = (await (await fetch(`http://127.0.0.1:${process.env.MOCK_PORT || 8788}/__log`)).json()).filter((x) => x.gemini).length;
  ok('chat: over the daily budget → passages only, no model call', c1.mode !== 'keyword' && c2.mode === 'keyword' && !!c2.answer && g1 === g0, { c1: c1.mode, c2: c2.mode, g0, g1 });

  const log = await (await fetch(`http://127.0.0.1:${process.env.MOCK_PORT || 8788}/__log`)).json();
  ok('gen reached Gemini', log.filter((x) => x.gemini).length >= 4, String(log.filter((x) => x.gemini).length));
  ok('create_draft with server-side token', log.some((x) => x.action === 'create_draft' && x.to === 'jobs@amitimai.example' && x.token === 'test-token'));
  // the address the model suggested is no application's direct contact, so the draft is saved without a recipient
  ok('Nika draft from the dashboard keeps the edited subject (unknown address dropped)', log.some((x) => x.action === 'create_draft' && x.subject === 'פולואפ ערוך מהדשבורד' && !x.to));
  ok('the dashboard chat talks to Nika (her prompt, tools, from the dashboard)', log.some((x) => x.gemini && /^את ניקה/.test(x.sys) && x.tools && x.web));
  ok('update_application from approve', log.some((x) => x.action === 'update_application' && x.id === 'app-01' && x.status === 'בתהליך'));
  ok('follow-up draft saved on the row', log.some((x) => x.action === 'update_application' && x.followup_draft));
  ok('no send action ever', !log.some((x) => /send/.test(x.action || '')));
  // sign out everywhere (last: it ends every session): a new epoch, so a session from before opens nothing
  const s1 = (setCookies(await login(FIP)).find((c) => c.startsWith('__Host-s=')) || '').split(';')[0];
  const s2 = (setCookies(await login(FIP)).find((c) => c.startsWith('__Host-s=')) || '').split(';')[0];
  ok('logout-all: needs a session', (await fetch(B + '/api/private/logout-all', { method: 'POST' })).status === 401);
  ok('logout-all: refused from another site', (await fetch(B + '/api/private/logout-all', { method: 'POST', headers: { Cookie: s1, Origin: 'https://evil.example' } })).status === 403);
  const la = await fetch(B + '/api/private/logout-all', { method: 'POST', headers: { Cookie: s1 } });
  ok('logout-all → every earlier session is signed out', la.status === 200 && (await ver(s1)).status === 401 && (await ver(s2)).status === 401);
  const s3 = (setCookies(await login(FIP)).find((c) => c.startsWith('__Host-s=')) || '').split(';')[0];
  ok('logout-all → signing in again works', (await ver(s3)).status === 200);
  await browser.close(); console.log(results.join('\n'));
  console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
})();
