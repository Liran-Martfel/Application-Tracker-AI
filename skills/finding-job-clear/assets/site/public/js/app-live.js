/* New data without reloading the page: while the tab is visible, ask the site once a minute for the data's version
   (GET /api/private/version: a tiny answer, no Apps Script read). When it differs from the version of the data on
   screen, the data is loaded again. A hidden tab asks nothing; coming back to it checks at once. */
(() => {
  const EVERY = 60000;
  let busy = false, last = 0;
  async function check() {
    if (busy || document.visibilityState !== 'visible' || !window.dash) return;
    const have = (window.dash.raw() || {}).ver;
    if (!have) return;   // the first load is not done yet
    busy = true; last = Date.now();
    try {
      const r = await fetch('/api/private/version', { credentials: 'same-origin' });
      const j = r.ok ? await r.json() : {};
      if (j.ver && j.ver !== have) await window.dash.refresh();
    } catch (e) { /* offline for a moment: the next minute tries again */ }
    finally { busy = false; }
  }
  setInterval(check, EVERY);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - last > EVERY) check(); });
})();
