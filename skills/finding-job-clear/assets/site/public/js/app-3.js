  (() => {
    const root = document.querySelector('.jt');
    const fmtDate = (s) => { if (!s) return ''; const [y, m, d] = s.split('-'); return `${d}.${m}.${y.slice(2)}`; };
    window.JT.fmtDate = fmtDate;

    const failLine = (el) => { el.replaceChildren(); const f = document.createElement('div'); f.className = 'jt-fail'; f.textContent = 'הטעינה נכשלה'; el.appendChild(f); };

    const drawBars = (el, rows, opts) => {
      el.replaceChildren();
      if (!rows.length) { const e = document.createElement('div'); e.className = 'jt-empty'; e.textContent = 'אין נתונים עדיין'; el.appendChild(e); return; }
      const max = Math.max(1, ...rows.map((r) => r[opts.value]));
      rows.forEach((r, i) => {
        const row = document.createElement('div'); row.className = 'jt-bar';
        const lab = document.createElement('div'); lab.className = 'jt-bar-label'; lab.textContent = r[opts.label]; lab.title = r[opts.label];
        const track = document.createElement('div'); track.className = 'jt-bar-track';
        const fill = document.createElement('div'); fill.className = 'jt-bar-fill' + (opts.anim ? ' jt-anim' : '');
        fill.style.width = `${(r[opts.value] / max) * 100}%`;
        fill.style.background = opts.color(r, i);
        track.appendChild(fill);
        const val = document.createElement('div'); val.className = 'jt-bar-val';
        const b = document.createElement('b'); b.textContent = d3.format(',')(r[opts.value]); val.appendChild(b);
        if (opts.extra) { const x = opts.extra(r); if (x) val.append(' ' + x); }
        row.append(lab, track, val);
        el.appendChild(row);
      });
    };

    const statusColor = (s) => {
      const c = window.JT.C;
      return { 'הוגש': 'var(--cds-chart-muted)', 'בתהליך': c[1], 'ראיון': c[2], 'הצעה': c[3], 'נדחה': 'var(--cds-chart-status-critical)' }[s] || c[0];
    };

    let animated = false;
    const tip = root.querySelector('.jt-tip');

    const drawWeekly = (el, rows) => {
      el.replaceChildren();
      if (!rows.length) { const e = document.createElement('div'); e.className = 'jt-empty'; e.textContent = 'אין נתונים עדיין'; el.appendChild(e); return; }
      const W = Math.max(260, el.clientWidth || 320), H = 200;
      const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('direction', 'ltr');
      const max = d3.max(rows, (r) => r.n) || 1;
      const y = d3.scaleLinear([0, max], [H - 28, 12]).nice();
      const yTicks = y.ticks(Math.min(4, max)).filter(Number.isInteger);
      const probe = svg.append('text').attr('font-size', 11).text(d3.format(',')(y.domain()[1]));
      const left = Math.ceil(probe.node().getComputedTextLength()) + 10; probe.remove();
      const x = d3.scaleBand(rows.map((r) => r.week), [left, W - 6]).padding(0.3);
      svg.append('g').selectAll('line').data(yTicks).join('line')
        .attr('x1', left).attr('x2', W - 6).attr('y1', (t) => y(t)).attr('y2', (t) => y(t))
        .attr('stroke', 'var(--cds-chart-grid)').attr('stroke-width', 1);
      svg.append('g').selectAll('text').data(yTicks).join('text')
        .attr('x', left - 6).attr('y', (t) => y(t)).attr('dy', '0.32em').attr('text-anchor', 'end')
        .attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((t) => d3.format(',')(t));
      const every = Math.max(1, Math.ceil(rows.length / Math.floor((W - left) / 52)));
      svg.append('g').selectAll('text').data(rows.filter((_, i) => i % every === 0)).join('text')
        .attr('x', (r) => x(r.week) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle')
        .attr('font-size', 11).attr('fill', 'var(--color-fg-muted)').text((r) => fmtDate(r.week).slice(0, 5));
      svg.append('line').attr('x1', left).attr('x2', W - 6).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', 'var(--cds-chart-axis)');
      const bw = Math.min(32, x.bandwidth());
      svg.append('g').selectAll('rect').data(rows).join('rect')
        .attr('x', (r) => x(r.week) + (x.bandwidth() - bw) / 2).attr('width', bw)
        .attr('y', (r) => y(r.n)).attr('height', (r) => Math.max(0, y(0) - y(r.n)))
        .attr('rx', 4).attr('fill', window.JT.C[0])
        .on('mousemove', (event, r) => {
          tip.hidden = false;
          tip.replaceChildren();
          const d = document.createElement('div'); d.className = 'jt-tip-d'; d.textContent = 'שבוע ' + fmtDate(r.week);
          const v = document.createElement('div'); v.textContent = d3.format(',')(r.n) + ' הגשות';
          tip.append(d, v);
          const box = root.getBoundingClientRect();
          let tx = event.clientX - box.left + 12, ty = event.clientY - box.top - 40;
          const tw = tip.offsetWidth;
          if (tx + tw > box.width) tx = event.clientX - box.left - tw - 12;
          tip.style.left = Math.max(0, tx) + 'px'; tip.style.top = Math.max(0, ty) + 'px';
          d3.select(event.currentTarget).attr('opacity', 0.75);
        })
        .on('mouseleave', (event) => { tip.hidden = true; d3.select(event.currentTarget).attr('opacity', 1); });
    };

    root.style.position = 'relative';

    dash.onData(() => {
      const cards = [
        ['by-status', 'by_status', (el, rows) => drawBars(el, rows, { label: 'status', value: 'n', color: (r) => statusColor(r.status), anim: !animated })],
        ['weekly', 'weekly', drawWeekly],
        ['by-level', 'by_level', (el, rows) => drawBars(el, rows, { label: 'group', value: 'n', color: () => window.JT.C[0], extra: (r) => `(${r.answered} ענו · ${r.answered_pct}%)`, anim: !animated })],
        ['by-origin', 'by_origin', (el, rows) => drawBars(el, rows, { label: 'group', value: 'n', color: () => window.JT.C[4], extra: (r) => `(${r.answered} ענו · ${r.answered_pct}%)`, anim: !animated })],
      ];
      let any = false;
      cards.forEach(([elId, src, draw]) => {
        const el = document.getElementById(elId);
        const d = dash.data(src);
        if (d.status === 'ok') { el.classList.remove('dash-skeleton'); draw(el, d.data || []); any = true; }
        else if (d.status === 'error') { el.classList.remove('dash-skeleton'); failLine(el); }
        else { el.replaceChildren(); el.classList.add('dash-skeleton'); }
      });
      if (any) animated = true;

      const rt = dash.data('response_time');
      root.querySelectorAll('[data-source="response_time"]').forEach((el) => {
        if (rt.status === 'ok' && rt.data[0]) { el.classList.remove('dash-skeleton'); el.textContent = d3.format(',')(rt.data[0][el.dataset.field]); }
        else { el.textContent = '—'; }
      });

      // weekly goal
      const wk = dash.data('weekly'), gl = dash.data('goals');
      const nowEl = root.querySelector('.jt-goal-now'), tgEl = root.querySelector('.jt-goal-target'), fill = root.querySelector('.jt-goal-fill'), msg = root.querySelector('.jt-goal-msg');
      if (wk.status === 'ok' && gl.status === 'ok' && gl.data[0]) {
        const t = new Date(); const ws = new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate() - t.getDay())).toISOString().slice(0, 10);
        const row = (wk.data || []).find((r) => r.week === ws);
        const n = row ? row.n : 0, goal = gl.data[0].weekly_goal;
        nowEl.classList.remove('dash-skeleton');
        nowEl.textContent = d3.format(',')(n);
        if (row) { nowEl.setAttribute('data-source', 'weekly'); nowEl.setAttribute('data-field', 'n'); nowEl.setAttribute('data-where', 'week=' + ws); }
        tgEl.textContent = d3.format(',')(goal);
        tgEl.setAttribute('data-source', 'goals'); tgEl.setAttribute('data-field', 'weekly_goal'); tgEl.setAttribute('data-row', '0');
        fill.style.width = Math.min(100, (n / Math.max(1, goal)) * 100) + '%';
        msg.textContent = n >= goal ? 'עמדת ביעד השבוע 🎉' : `נשארו ${goal - n} הגשות כדי לעמוד ביעד`;
      } else if (wk.status === 'error' || gl.status === 'error') { failLine(root.querySelector('.jt-goal')); }

      // interview prep
      const pr = dash.data('prep'), prepEl = document.getElementById('prep').querySelector('.jt-prep');
      prepEl.replaceChildren();
      if (pr.status === 'ok') {
        prepEl.classList.remove('dash-skeleton');
        const items = pr.data || [];
        if (!items.length) { const e = document.createElement('div'); e.className = 'jt-empty'; e.textContent = 'אין כרגע תהליכים פעילים שדורשים הכנה'; prepEl.appendChild(e); }
        items.forEach((p) => {
          const box = document.createElement('article'); box.className = 'jt-prep-item'; box.id = 'prep-' + String(p.id).replace(/[^A-Za-z0-9_-]/g, '');
          const h = document.createElement('h3'); h.textContent = p.company;
          const role = document.createElement('div'); role.className = 'jt-prep-role'; role.textContent = p.role;
          const st = document.createElement('div'); st.className = 'jt-prep-stage'; st.textContent = p.stage;
          const ab = document.createElement('p'); ab.textContent = p.about;
          const list = (title, text, open) => {
            const d = document.createElement('details'); if (open) d.open = true;
            const sm = document.createElement('summary'); sm.textContent = title; d.appendChild(sm);
            const ul = document.createElement('ul');
            String(text || '').split('|').filter(Boolean).forEach((q) => { const li = document.createElement('li'); li.textContent = q; ul.appendChild(li); });
            d.appendChild(ul); return d;
          };
          box.append(h, role, st, ab, list('שאלות צפויות', p.questions, true), list('מה להכין', p.todo, false));
          if (p.link && /^https:\/\/mail\.google\.com\//.test(p.link)) { const a = document.createElement('a'); a.href = window.JT.mailHref(p.link, p.thread_id); a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = 'למייל הרלוונטי ↗'; box.appendChild(a); }
          prepEl.appendChild(box);
        });
      } else if (pr.status === 'error') { failLine(prepEl); } else { prepEl.classList.add('dash-skeleton'); }

      const k = dash.data('kpis');
      root.querySelectorAll('[data-source="kpis"]').forEach((el) => {
        if (k.status === 'ok' && k.data[0]) { el.classList.remove('dash-skeleton'); el.textContent = d3.format(',')(k.data[0][el.dataset.field]); }
        else { if (k.status !== 'error') el.classList.add('dash-skeleton'); else el.classList.remove('dash-skeleton'); el.textContent = '—'; }
      });
    });
  })();
