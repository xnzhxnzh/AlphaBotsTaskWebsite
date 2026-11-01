/* Views: home dashboard, calendar, timeline (Gantt). */
(function () {
  'use strict';
  const App = window.App, C = App.C, D = App.date, store = App.store, ui = App.ui, h = ui.h;
  const views = (App.views = App.views || {});

  const pageHead = (title, sub, ...actions) =>
    h('div', { class: 'page-head' }, h('h1', null, title), sub && h('span', { class: 'sub' }, sub), h('span', { class: 'spacer' }), actions);
  App.pageHead = pageHead;
  const btn = (label, icon, fn, cls) =>
    h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: fn }, icon && ui.icon(icon), h('span', { class: 'btn-label' }, label));
  App.btn = btn;

  const eventTime = (e) => (e.startTime ? ui.fmtTime(e.startTime) + (e.endTime ? ' to ' + ui.fmtTime(e.endTime) : '') : 'All day');

  /* ======================= HOME ======================= */
  views.home = function (root) {
    const st = store.state, today = D.today();
    const upcoming = [
      ...st.events.filter((e) => e.end >= today && e.status !== 'Cancelled').map((e) => ({ type: 'event', id: e.id, date: e.start < today ? today : e.start, title: e.title, sub: [eventTime(e), e.location].filter(Boolean).join(' - '), color: C.kindColor[e.kind] })),
      ...st.tasks.filter((t) => t.milestone && t.start >= today && t.status !== 'Done').map((t) => ({ type: 'milestone', id: t.id, date: t.start, title: t.title, sub: 'Deadline', color: C.milestoneColor }))
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8);

    const needed = st.parts.filter((p) => p.status === 'Needed').sort((a, b) => (a.neededBy || '9').localeCompare(b.neededBy || '9'));
    const work = st.tasks.filter((t) => !t.milestone);
    const open = work.filter((t) => t.status !== 'Done');
    const avg = work.length ? Math.round(work.reduce((s, t) => s + (t.status === 'Done' ? 100 : t.progress), 0) / work.length) : 0;
    const overdue = open.filter((t) => t.end < today).length;
    const in30 = st.events.filter((e) => e.end >= today && e.start <= D.addDays(today, 30) && e.status !== 'Cancelled').length;
    const news = st.news.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date)).slice(0, 3);

    const stat = (num, label, href) => h('a', { class: 'card stat', href, style: { textDecoration: 'none', color: 'inherit' } }, h('div', { class: 'num' }, num), h('div', { class: 'lbl' }, label));
    const card = (title, href, body) => h('section', { class: 'card' }, h('div', { class: 'card-head' }, h('h2', null, title), h('span', { class: 'spacer' }), href && h('a', { href }, 'View all')), body);

    root.append(
      pageHead(`${st.settings.teamName} ${st.settings.teamNumber}`.trim(), 'Season hub'),
      h('div', { class: 'grid grid-4', style: { marginBottom: '16px' } },
        stat(in30, 'Events in the next 30 days', '#/calendar'),
        stat(open.length, 'Open robot and team tasks', '#/tasks'),
        stat(needed.length, 'Parts still needed', '#/parts'),
        stat(overdue, 'Tasks overdue', '#/tasks')),
      h('div', { class: 'grid grid-2', style: { marginBottom: '16px' } },
        card('Coming up', '#/calendar', upcoming.length
          ? h('ul', { class: 'list' }, upcoming.map((u) => h('li', { onclick: () => App.forms.edit(u.type, u.id) },
            h('span', { class: 'when' }, ui.relDay(u.date)),
            h('span', { class: 'chip-dot', style: { background: u.color, alignSelf: 'center' } }),
            h('span', null, h('strong', null, u.title), u.sub && h('div', { class: 'muted' }, u.sub)))))
          : h('div', { class: 'empty' }, 'Nothing scheduled yet.')),
        card('Latest news', '#/news', news.length
          ? h('ul', { class: 'list' }, news.map((n) => h('li', { onclick: () => { location.hash = '#/news'; } },
            h('span', { class: 'when' }, ui.fmtShort(n.date)),
            h('span', null, h('strong', null, n.title), n.pinned && h('span', { class: 'pin' }, 'PINNED'), h('div', { class: 'muted' }, n.body.slice(0, 90) + (n.body.length > 90 ? '...' : ''))))))
          : h('div', { class: 'empty' }, 'No posts yet.'))),
      h('div', { class: 'grid grid-2' },
        card('Shopping list: still needed', '#/parts', needed.length
          ? h('ul', { class: 'list' }, needed.slice(0, 6).map((p) => h('li', { onclick: () => App.forms.part(p.id) },
            h('span', { class: 'when' }, p.neededBy ? ui.fmtShort(p.neededBy) : 'No date'),
            h('span', null, h('strong', null, p.name), h('span', { class: 'muted' }, `  x${p.qty}${p.vendor ? ' from ' + p.vendor : ''}`)))))
          : h('div', { class: 'empty' }, 'Nothing needed right now.')),
        card('Robot and team progress', '#/gantt', h('div', { class: 'card-body' },
          h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: '6px' } }, h('strong', null, 'Overall'), h('span', null, avg + '%')),
          h('div', { class: 'progress' }, h('i', { style: { width: avg + '%' } })),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' } },
            C.taskStatus.map((s) => h('span', { class: 'badge s-' + ui.slug(s) }, `${s}: ${work.filter((t) => t.status === s).length}`))))))
    );
  };

  /* ======================= CALENDAR ======================= */
  const cal = { mode: 'month', y: new Date().getFullYear(), m: new Date().getMonth(), day: D.today(), show: { event: true, milestone: true, task: true, part: true } };
  const LEGEND = [['event', 'Events', '#1971c2'], ['milestone', 'Deadlines', C.milestoneColor], ['task', 'Tasks', C.taskColor], ['part', 'Parts needed', C.partColor]];

  function calendarItems(from, to) {
    const map = {};
    const put = (date, item) => (map[date] = map[date] || []).push(item);
    const spread = (a, b, item) => { for (let d = a < from ? from : a, e = b > to ? to : b; d <= e; d = D.addDays(d, 1)) put(d, item); };
    const st = store.state;
    if (cal.show.event) st.events.forEach((e) => spread(e.start, e.end, { type: 'event', id: e.id, order: 1, label: (e.startTime ? ui.fmtTime(e.startTime).replace(':00', '') + ' ' : '') + e.title, color: C.kindColor[e.kind], cancelled: e.status === 'Cancelled', time: e.startTime }));
    st.tasks.forEach((t) => {
      if (t.milestone && cal.show.milestone) spread(t.start, t.start, { type: 'milestone', id: t.id, order: 0, label: 'Due: ' + t.title, color: C.milestoneColor, cancelled: t.status === 'Done' });
      else if (!t.milestone && cal.show.task) spread(t.start, t.end, { type: 'task', id: t.id, order: 2, label: t.title, color: t.status === 'Done' ? '#868e96' : C.taskColor });
    });
    if (cal.show.part) st.parts.filter((p) => p.neededBy && p.status === 'Needed').forEach((p) => spread(p.neededBy, p.neededBy, { type: 'part', id: p.id, order: 3, label: 'Need: ' + p.name, color: C.partColor }));
    for (const k of Object.keys(map)) map[k].sort((a, b) => a.order - b.order || (a.time || '').localeCompare(b.time || '') || a.label.localeCompare(b.label));
    return map;
  }

  views.calendar = function (root) {
    const week = cal.mode === 'week';
    let first, last, title;
    if (week) {
      const d = D.parse(cal.day);
      first = D.addDays(cal.day, -d.getDay());
      last = D.addDays(first, 6);
      title = ui.fmtRange(first, last) + ', ' + D.parse(last).getFullYear();
    } else {
      const m1 = new Date(cal.y, cal.m, 1);
      first = D.addDays(D.iso(m1), -m1.getDay());
      const lastDay = new Date(cal.y, cal.m + 1, 0);
      last = D.addDays(D.iso(lastDay), 6 - lastDay.getDay());
      title = m1.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    }
    const move = (dir) => {
      if (week) cal.day = D.addDays(cal.day, 7 * dir);
      else { const d = new Date(cal.y, cal.m + dir, 1); cal.y = d.getFullYear(); cal.m = d.getMonth(); }
      App.render();
    };
    const goToday = () => { const n = new Date(); cal.y = n.getFullYear(); cal.m = n.getMonth(); cal.day = D.today(); App.render(); };
    const setMode = (m) => { cal.mode = m; if (m === 'week') { const t = D.today(); const inMonth = D.parse(t).getMonth() === cal.m && D.parse(t).getFullYear() === cal.y; cal.day = inMonth ? t : D.iso(new Date(cal.y, cal.m, 1)); } else { const d = D.parse(cal.day); cal.y = d.getFullYear(); cal.m = d.getMonth(); } App.render(); };

    const items = calendarItems(first, last);
    const today = D.today();
    const maxChips = week ? 40 : window.innerWidth < 760 ? 2 : 3;
    const cells = [];
    for (let d = first; d <= last; d = D.addDays(d, 1)) {
      const list = items[d] || [];
      const date = D.parse(d);
      const other = !week && date.getMonth() !== cal.m;
      const chips = list.slice(0, maxChips).map((it) => h('button', { type: 'button', class: 'cal-chip' + (it.cancelled ? ' cancelled' : ''), style: { background: it.color }, title: it.label,
        onclick: (e) => { e.stopPropagation(); App.forms.edit(it.type, it.id); } }, it.label));
      const more = list.length - maxChips;
      cells.push(h('div', { class: 'cal-cell' + (other ? ' other' : '') + (d === today ? ' today' : ''), onclick: () => { if (App.auth.canCreate('event')) App.forms.event(null, { start: d }); }, 'aria-label': ui.fmtDate(d) },
        h('div', { class: 'dnum' }, date.getDate()),
        chips,
        more > 0 && h('div', { class: 'cal-more', onclick: (e) => { e.stopPropagation(); cal.day = d; cal.mode = 'week'; App.render(); } }, `+${more} more`)));
    }
    root.append(
      pageHead('Calendar', null,
        App.auth.canCreate('event') && btn('Event', 'plus', () => App.forms.event(null), 'btn-primary')),
      h('div', { class: 'toolbar' },
        btn('', 'left', () => move(-1)), btn('Today', null, goToday), btn('', 'right', () => move(1)),
        h('span', { class: 'cal-title' }, title),
        h('span', { class: 'spacer' }),
        btn('Download .ics', 'download', () => App.exportIcs()),
        h('div', { class: 'seg' }, ['month', 'week'].map((m) => h('button', { type: 'button', class: cal.mode === m ? 'on' : '', onclick: () => setMode(m) }, m[0].toUpperCase() + m.slice(1))))),
      h('div', { class: 'toolbar' }, LEGEND.map(([key, label, color]) =>
        h('label', { class: 'chip-toggle' }, h('input', { type: 'checkbox', checked: cal.show[key], onchange: (e) => { cal.show[key] = e.target.checked; App.render(); } }),
          h('span', { class: 'chip-dot', style: { background: color } }), label))),
      h('div', { class: 'cal' },
        h('div', { class: 'cal-head' }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n) => h('div', null, n))),
        h('div', { class: 'cal-grid' + (week ? ' week' : '') }, cells)));
  };

})();
