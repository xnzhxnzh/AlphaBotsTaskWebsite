/* Gantt chart: tasks, deadlines and (optionally) events on a scrollable day grid.
   Drag a bar to move it, drag its right edge to change the finish date. Click to open it. */
(function () {
  'use strict';
  const App = window.App, C = App.C, D = App.date, store = App.store, ui = App.ui, h = ui.h, auth = App.auth;
  const views = (App.views = App.views || {});

  const g = { zoom: 'week', team: '', hideDone: false, events: false, collapsed: {} };
  const PX = { day: 32, week: 14, month: 5 }; // pixels per day
  const NAME_W = 270;
  const DONE = '#868e96';

  const collFor = (type) => (type === 'event' ? 'events' : 'tasks');

  function buildRows() {
    const st = store.state;
    const inTeam = (o) => !g.team || o.team === g.team;
    const live = (o) => !(g.hideDone && o.status === 'Done');
    const rows = [];
    const group = (name, items) => { if (items.length) { rows.push({ group: name, count: items.length }); if (!g.collapsed[name]) items.forEach((i) => rows.push(i)); } };
    const mk = (o, type) => ({ type, obj: o, id: o.id, title: o.title, who: type === 'task' ? App.taskPeople(o) : null, start: o.start, end: o.end, milestone: type === 'task' && o.milestone, done: o.status === 'Done', progress: o.status === 'Done' ? 100 : o.progress || 0,
      color: type === 'event' ? C.kindColor[o.kind] : o.milestone ? C.milestoneColor : o.status === 'Done' ? DONE : C.taskColor });
    const sortStart = (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title);

    group('Deadlines and milestones', st.tasks.filter((t) => t.milestone && inTeam(t) && live(t)).sort(sortStart).map((t) => mk(t, 'task')));
    for (const team of [...C.teams, '']) {
      const ts = st.tasks.filter((t) => !t.milestone && (team ? t.team === team : !C.teams.includes(t.team)) && inTeam(t) && live(t)).sort(sortStart);
      group(team || 'Other', ts.map((t) => mk(t, 'task')));
    }
    if (g.events) group('Events', st.events.filter((e) => e.status !== 'Cancelled' && inTeam(e) && live(e)).sort(sortStart).map((e) => mk(e, 'event')));
    return rows;
  }

  views.gantt = function (root) {
    const w = PX[g.zoom];
    const rows = buildRows();
    const bars = rows.filter((r) => !r.group);
    const today = D.today();

    // visible range: from a week before the earliest item (and today) to two weeks past the latest
    let min = today, max = D.addDays(today, 49);
    bars.forEach((b) => { if (b.start < min) min = b.start; if (b.end > max) max = b.end; });
    min = D.addDays(min, -7); max = D.addDays(max, 14);
    const start = D.addDays(min, -((D.parse(min).getDay() + 6) % 7)); // back to a Monday so week lines line up
    const days = D.diffDays(start, max) + 1;
    const total = days * w;
    const x = (date) => D.diffDays(start, date) * w;

    const track = (style, ...kids) => h('div', { class: 'g-track', style: Object.assign({ width: total + 'px' }, style) }, kids);
    const grid = w >= 10
      ? { backgroundImage: `repeating-linear-gradient(to right, transparent 0 ${5 * w}px, rgba(127,127,127,.10) ${5 * w}px ${7 * w}px), repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${7 * w}px)` }
      : { backgroundImage: `repeating-linear-gradient(to right, var(--border) 0 1px, transparent 1px ${7 * w}px)` };

    /* header: month names above, day numbers (or week starts) below */
    const monthCells = [];
    for (let i = 0; i < days;) {
      const d = D.addDays(start, i), dt = D.parse(d);
      const len = Math.min(days - i, new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate() - dt.getDate() + 1);
      monthCells.push(h('div', { class: 'g-cell', style: { left: i * w + 'px', width: len * w + 'px', fontWeight: 600 } }, dt.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })));
      i += len;
    }
    const dayCells = [];
    if (w >= 10) for (let i = 0; i < days; i++) {
      const d = D.addDays(start, i), dt = D.parse(d);
      if (w >= 20 || dt.getDay() === 1) dayCells.push(h('div', { class: 'g-cell', style: { left: i * w + 'px', width: (w >= 20 ? w : 7 * w) + 'px', padding: '5px 2px', textAlign: w >= 20 ? 'center' : 'left', background: d === today ? 'rgba(214,51,108,.18)' : '' } }, dt.getDate()));
    }
    const head = h('div', { class: 'g-head' },
      h('div', { class: 'g-row' }, h('div', { class: 'g-name' }, 'Task'), track({}, monthCells)),
      h('div', { class: 'g-row' }, h('div', { class: 'g-name' }), track({}, dayCells)));

    const open = (r) => App.forms.edit(r.type, r.id);

    /* dragging: move the bar, or stretch its right edge */
    function drag(el, r, mode, baseWidth) {
      el.style.touchAction = 'none';
      el.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const lvl = auth.level(r.type, r.obj);
        const can = lvl === 'full' || lvl === 'edit';
        const x0 = e.clientX;
        let moved = false;
        el.setPointerCapture(e.pointerId);
        document.body.classList.add('dragging'); // hold off live updates from teammates until the drop
        const delta = (ev) => Math.round((ev.clientX - x0) / w);
        const onMove = (ev) => {
          if (Math.abs(ev.clientX - x0) > 3) moved = true;
          if (!can || !moved) return;
          if (mode === 'move') el.style.transform = `translateX(${delta(ev) * w}px)`;
          else el.style.width = Math.max(w, baseWidth + delta(ev) * w) + 'px';
        };
        const onUp = (ev) => {
          el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerup', onUp); el.removeEventListener('pointercancel', onUp);
          document.body.classList.remove('dragging');
          const n = delta(ev);
          if (!moved) return open(r);
          if (!can) { ui.toast('Your role cannot change this.'); return App.render(); }
          if (!n) return App.render();
          const o = Object.assign({}, r.obj);
          if (mode === 'move') { o.start = D.addDays(o.start, n); o.end = D.addDays(o.end, n); }
          else { o.end = D.addDays(o.end, n); if (o.end < o.start) o.end = o.start; }
          const stored = store.upsert(collFor(r.type), o);
          if (r.type === 'task') { const note = App.deps.afterEdit(stored.id); if (note) ui.toast(note); } // keep dependent tasks in order
          App.render();
        };
        el.addEventListener('pointermove', onMove); el.addEventListener('pointerup', onUp); el.addEventListener('pointercancel', onUp);
      });
    }

    const body = rows.map((r) => {
      if (r.group) {
        const closed = !!g.collapsed[r.group];
        return h('div', { class: 'g-row group' },
          h('div', { class: 'g-name', style: { cursor: 'pointer' }, role: 'button', tabindex: '0', 'aria-expanded': String(!closed),
            onclick: () => { g.collapsed[r.group] = !closed; App.render(); }, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.collapsed[r.group] = !closed; App.render(); } } },
          (closed ? '▸ ' : '▾ ') + r.group, h('span', { class: 'muted', style: { marginLeft: '6px', fontWeight: 400 } }, `(${r.count})`)), track({}));
      }
      const left = x(r.start), width = Math.max(w, (D.diffDays(r.start, r.end) + 1) * w);
      const label = r.milestone ? `${r.title} (${ui.fmtShort(r.start)})` : r.title;
      const who = r.who && r.who.all.length ? r.who.primary.join(', ') + (r.who.members.length ? (r.who.primary.length ? ' + ' : '') + r.who.members.length : '') : '';
      const preds = r.type === 'task' ? App.deps.preds(r.obj) : [];
      const late = r.type === 'task' ? App.deps.conflicts(r.obj) : [];
      const tip = (r.who ? `${r.title}\nPrimary: ${r.who.primary.join(', ') || 'nobody'}\nSub-people: ${r.who.members.join(', ') || 'nobody'}` : r.title)
        + (preds.length ? `\nWaits for: ${preds.map((p) => p.title).join(', ')}` : '')
        + (late.length ? `\nStarts before "${late[0].title}" finishes` : '');
      const name = h('div', { class: 'g-name', title: tip, onclick: () => open(r) },
        late.length ? h('span', { class: 'g-warn', 'aria-label': 'Starts before a task it waits for has finished' }, '⚠') : null,
        h('span', { class: 'g-title' }, (r.milestone ? '◆ ' : '') + r.title), who && h('span', { class: 'g-who' }, who),
        !r.milestone && r.type === 'task' && h('span', { class: 'muted g-pct' }, r.progress + '%'));
      let mark;
      if (r.milestone) {
        const d = h('div', { class: 'g-diamond', style: { left: left + w / 2 - 8 + 'px', background: r.done ? DONE : r.color }, title: label });
        drag(d, r, 'move', 0);
        mark = [d, h('div', { class: 'g-label', style: { left: left + w / 2 + 14 + 'px' } }, label)];
      } else {
        const inner = width > 110;
        const bar = h('div', { class: 'g-bar', style: { left: left + 'px', width: width + 'px', background: r.color }, title: `${r.title}: ${ui.fmtRange(r.start, r.end)}` },
          r.progress ? h('i', { style: { width: r.progress + '%' } }) : null, inner ? h('span', null, r.title) : null);
        const handle = h('span', { class: 'g-handle', title: 'Drag to change the finish date' });
        bar.append(handle);
        drag(bar, r, 'move', width);
        drag(handle, r, 'resize', width);
        mark = [bar, !inner && h('div', { class: 'g-label', style: { left: left + width + 6 + 'px' } }, r.title)];
      }
      return h('div', { class: 'g-row' }, name, track(grid, mark));
    });

    /* dependency arrows: an elbow line from the end of the task waited for to the start of the waiting task */
    const HEAD_H = 52, ROW_H = 34, NS = 'http://www.w3.org/2000/svg';
    const rowIndex = new Map(rows.map((r, i) => [r.id, i]).filter(([id]) => id));
    const links = document.createElementNS(NS, 'svg');
    links.setAttribute('class', 'g-links');
    links.setAttribute('width', total);
    links.setAttribute('height', HEAD_H + rows.length * ROW_H);
    links.style.left = NAME_W + 'px';
    links.setAttribute('aria-hidden', 'true');
    const el = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };
    for (const r of rows) {
      if (r.group || r.type !== 'task') continue;
      for (const pid of r.obj.waitsFor || []) {
        const pi = rowIndex.get(pid), si = rowIndex.get(r.id);
        if (pi == null || si == null) continue; // the other task is hidden by a filter or a collapsed group
        const p = rows[pi];
        const x1 = p.milestone ? x(p.end) + w / 2 + 11 : x(p.end) + w;
        const x2 = r.milestone ? x(r.start) + w / 2 - 11 : x(r.start);
        const y1 = HEAD_H + pi * ROW_H + ROW_H / 2, y2 = HEAD_H + si * ROW_H + ROW_H / 2;
        const bad = r.obj.start <= p.obj.end;
        const xm = x1 + 8, dir = y2 > y1 ? 1 : -1;
        const d = x2 >= xm + 8
          ? `M${x1} ${y1} H${xm} V${y2} H${x2}`
          : `M${x1} ${y1} H${xm} V${y1 + dir * ROW_H / 2} H${x2 - 8} V${y2} H${x2}`; // successor starts before the end: loop back around
        const color = bad ? '#e03131' : '#868e96';
        links.append(el('path', { d, fill: 'none', stroke: color, 'stroke-width': bad ? 2 : 1.5 }),
          el('polygon', { points: `${x2},${y2} ${x2 - 7},${y2 - 4} ${x2 - 7},${y2 + 4}`, fill: color }));
      }
    }

    const todayLine = h('div', { class: 'g-today', style: { left: NAME_W + x(today) + w / 2 - 1 + 'px', height: '0' } });
    const chart = h('div', { class: 'gantt', style: { position: 'relative' } }, head, body.length ? body : h('div', { class: 'empty' }, 'Nothing to show yet. Add a task or a deadline.'), links, todayLine);
    const toToday = () => { chart.scrollLeft = Math.max(0, x(today) - 140); };

    const seg = h('div', { class: 'seg' }, ['day', 'week', 'month'].map((z) => h('button', { type: 'button', class: g.zoom === z ? 'on' : '', onclick: () => { g.zoom = z; App.render(); } }, z[0].toUpperCase() + z.slice(1))));
    const chip = (label, key) => h('label', { class: 'chip-toggle' }, h('input', { type: 'checkbox', checked: g[key], onchange: (e) => { g[key] = e.target.checked; App.render(); } }), label);
    const canAdd = auth.canCreate('task');
    const outOfOrder = App.deps.conflictCount();
    const autoShift = h('label', { class: 'chip-toggle', title: 'When you move or lengthen a task, tasks that wait for it are pushed later if they would start too early.' },
      h('input', { type: 'checkbox', checked: store.state.settings.autoShift !== false, disabled: !canAdd, onchange: (e) => { store.saveSettings({ autoShift: e.target.checked }); App.render(); } }), 'Move later tasks automatically');
    root.append(
      App.pageHead('Gantt chart', 'Drag a bar to move it, drag its right edge to change the finish date. Arrows show what waits for what.',
        canAdd && App.btn('Task', 'plus', () => App.forms.task(null), 'btn-primary'), canAdd && App.btn('Deadline', 'flag', () => App.forms.task(null, { milestone: true }))),
      h('div', { class: 'toolbar' }, seg, App.btn('Today', null, toToday),
        h('select', { 'aria-label': 'Sub-team', onchange: (e) => { g.team = e.target.value; App.render(); } }, [h('option', { value: '' }, 'All sub-teams'), ...C.teams.map((t) => h('option', { value: t, selected: g.team === t }, t))]),
        chip('Show events', 'events'), chip('Hide done', 'hideDone'), autoShift,
        outOfOrder > 0 && h('span', { class: 'badge conflict', role: 'status' }, `⚠ ${outOfOrder} out of order`),
        outOfOrder > 0 && canAdd && App.btn('Fix order', null, () => { const n = App.deps.fixAll(); ui.toast(n ? `Moved ${n} task${n === 1 ? '' : 's'} later.` : 'Nothing could be moved. Check the dates of the tasks marked ⚠.'); App.render(); }, 'btn-small'),
        h('span', { class: 'spacer' }), App.btn('Print', 'print', () => window.print())),
      chart);

    requestAnimationFrame(() => { todayLine.style.height = chart.scrollHeight + 'px'; toToday(); });
  };
})();
