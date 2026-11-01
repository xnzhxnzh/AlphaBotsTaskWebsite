/* Views: events, tasks (list + board), parts, people, news, search. */
(function () {
  'use strict';
  const App = window.App, C = App.C, D = App.date, store = App.store, ui = App.ui, h = ui.h, auth = App.auth;
  const views = (App.views = App.views || {});
  const pageHead = (...a) => App.pageHead(...a);
  const btn = (...a) => App.btn(...a);

  /* ---------- shared table helper ---------- */
  // cols: [{label, cls, sort(row), cell(row)}]; sortState: {i, dir}; rows are clickable
  function table(cols, rows, sortState, onRow, emptyText) {
    const sorted = rows.slice();
    const col = cols[sortState.i];
    if (col && col.sort) sorted.sort((a, b) => { const x = col.sort(a), y = col.sort(b); return (x < y ? -1 : x > y ? 1 : 0) * sortState.dir; });
    if (!sorted.length) return h('div', { class: 'card empty' }, emptyText);
    return h('div', { class: 'card table-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, cols.map((c, i) => h('th', { class: (c.cls || '') + (c.sort ? ' sortable' : ''), 'aria-sort': i === sortState.i ? (sortState.dir > 0 ? 'ascending' : 'descending') : null,
        onclick: c.sort ? () => { sortState.dir = sortState.i === i ? -sortState.dir : 1; sortState.i = i; App.render(); } : null },
        c.label + (i === sortState.i ? (sortState.dir > 0 ? ' ▲' : ' ▼') : ''))))),
      h('tbody', null, sorted.map((r) => h('tr', { onclick: () => onRow(r) }, cols.map((c) => h('td', { class: c.cls || '' }, c.cell(r))))))));
  }
  const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
  // A status dropdown inside a table row. Disabled when the signed-in role may not change that item.
  function statusSelect(type, coll, row, options) {
    const lvl = auth.level(type, row);
    if (lvl === 'view') return ui.badge(row.status);
    return h('select', { class: 'inline-select', 'aria-label': 'Status', onclick: (e) => e.stopPropagation(),
      onchange: (e) => { const next = Object.assign({}, row, { status: e.target.value }); if (coll === 'tasks' && next.status === 'Done') next.progress = 100; store.upsert(coll, next); App.render(); } },
      options.map((s) => h('option', { value: s, selected: row.status === s }, s)));
  }
  const searchBox = (state, ph) => h('input', { type: 'search', placeholder: ph, value: state.q, 'aria-label': 'Filter', oninput: (e) => { state.q = e.target.value; clearTimeout(state.t); state.t = setTimeout(() => { App.render(); const el = document.querySelector('.toolbar input[type=search]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 250); } });
  const selectOf = (label, value, options, onChange) => h('select', { 'aria-label': label, onchange: (e) => onChange(e.target.value) }, options.map((o) => { const v = typeof o === 'string' ? o : o.value, l = typeof o === 'string' ? o : o.label; return h('option', { value: v, selected: value === v }, l); }));
  const seg = (items, value, onPick) => h('div', { class: 'seg' }, items.map(([v, l]) => h('button', { type: 'button', class: value === v ? 'on' : '', onclick: () => onPick(v) }, l)));
  const addBtn = (type, label, fn) => auth.canCreate(type) && btn(label, 'plus', fn, 'btn-primary');

  /* ======================= TASKS ======================= */
  // Primary people in bold, then how many sub-people help; hover for the full list.
  function peopleCell(t) {
    const who = App.taskPeople(t);
    const tip = `Primary: ${who.primary.join(', ') || 'nobody'}\nSub-people: ${who.members.join(', ') || 'nobody'}`;
    if (!who.all.length) return h('span', { class: 'muted' }, 'Nobody');
    return h('span', { title: tip }, who.primary.length ? h('strong', null, who.primary.join(', ')) : null,
      who.members.length ? h('span', { class: 'muted' }, (who.primary.length ? '  + ' : '') + who.members.length + (who.members.length === 1 ? ' sub-person' : ' sub-people')) : null);
  }
  const tk = { q: '', mode: 'list', team: '', status: '', assignee: '', hideDone: false, sort: { i: 2, dir: 1 } };
  views.tasks = function (root) {
    let rows = store.state.tasks.filter((t) => ui.contains(t, tk.q) && (!tk.team || t.team === tk.team) && (!tk.status || t.status === tk.status) && (!tk.assignee || App.taskPeople(t).all.includes(tk.assignee)) && !(tk.hideDone && t.status === 'Done'));
    const cols = [
      { label: 'Task', sort: (t) => t.title.toLowerCase(), cls: 'title', cell: (t) => (t.milestone ? '◆ ' : '') + t.title },
      { label: 'Sub-team', sort: (t) => t.team, cell: (t) => t.team },
      { label: 'Dates', sort: (t) => t.start, cell: (t) => ui.fmtRange(t.start, t.end) },
      { label: 'People', sort: (t) => App.taskPeople(t).primary.join(', ').toLowerCase(), cell: (t) => peopleCell(t) },
      { label: 'Progress', cell: (t) => (t.milestone ? '' : h('div', { style: { minWidth: '90px' } }, h('div', { class: 'progress' }, h('i', { style: { width: (t.status === 'Done' ? 100 : t.progress) + '%' } })))) },
      { label: 'Status', sort: (t) => t.status, cell: (t) => statusSelect('task', 'tasks', t, C.taskStatus) }
    ];
    const board = () => h('div', { class: 'board' }, C.taskStatus.map((s) => {
      const items = rows.filter((t) => t.status === s);
      const col = h('div', { class: 'col' }, h('h3', null, s, h('span', null, items.length)));
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', () => col.classList.remove('over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault(); col.classList.remove('over');
        const t = store.find('tasks', e.dataTransfer.getData('text/plain'));
        if (!t || t.status === s) return;
        if (auth.level('task', t) === 'view') { ui.toast('Your role cannot move this task.'); return; }
        store.upsert('tasks', Object.assign({}, t, { status: s, progress: s === 'Done' ? 100 : t.progress })); App.render();
      });
      items.forEach((t) => col.append(h('div', { class: 'kcard', draggable: auth.level('task', t) !== 'view', onclick: () => App.forms.task(t.id),
        ondragstart: (e) => e.dataTransfer.setData('text/plain', t.id) },
        h('div', { class: 't' }, (t.milestone ? '◆ ' : '') + t.title),
        h('div', { class: 'muted' }, ui.fmtRange(t.start, t.end)), (t.primary.length || t.members.length) && h('div', { class: 'muted' }, peopleCell(t)))));
      return col;
    }));
    root.append(
      pageHead('Tasks', `${rows.length} shown`, addBtn('task', 'Task', () => App.forms.task(null)), auth.canCreate('task') && btn('Deadline', 'flag', () => App.forms.task(null, { milestone: true }))),
      h('div', { class: 'toolbar' },
        searchBox(tk, 'Filter tasks'),
        seg([['list', 'List'], ['board', 'Board']], tk.mode, (v) => { tk.mode = v; App.render(); }),
        selectOf('Sub-team', tk.team, [{ value: '', label: 'All sub-teams' }, ...C.teams], (v) => { tk.team = v; App.render(); }),
        selectOf('Status', tk.status, [{ value: '', label: 'Any status' }, ...C.taskStatus], (v) => { tk.status = v; App.render(); }),
        selectOf('Person or team', tk.assignee, [{ value: '', label: 'Anyone' }, ...store.assignees()], (v) => { tk.assignee = v; App.render(); }),
        h('label', { class: 'chip-toggle' }, h('input', { type: 'checkbox', checked: tk.hideDone, onchange: (e) => { tk.hideDone = e.target.checked; App.render(); } }), 'Hide done')),
      tk.mode === 'board' ? board() : table(cols, rows, tk.sort, (t) => App.forms.task(t.id), 'No tasks match.'));
  };

  /* ======================= PARTS ======================= */
  const pt = { q: '', status: '', team: '', sort: { i: 6, dir: 1 } };
  views.parts = function (root) {
    const all = store.state.parts;
    const rows = all.filter((p) => ui.contains(p, pt.q) && (!pt.status || p.status === pt.status) && (!pt.team || p.team === pt.team));
    const cost = (p) => (p.qty || 0) * (p.unitCost || 0);
    const count = (s) => all.filter((p) => p.status === s).length;
    const open = all.filter((p) => p.status !== 'Received').reduce((s, p) => s + cost(p), 0);
    const cols = [
      { label: 'Item', sort: (p) => p.name.toLowerCase(), cls: 'title', cell: (p) => p.name },
      { label: 'Qty', cls: 'num', sort: (p) => p.qty, cell: (p) => p.qty },
      { label: 'Vendor', sort: (p) => p.vendor.toLowerCase(), cell: (p) => p.vendor },
      { label: 'Part #', cell: (p) => p.partNo },
      { label: 'Unit', cls: 'num', sort: (p) => p.unitCost, cell: (p) => (p.unitCost ? ui.money(p.unitCost) : '') },
      { label: 'Total', cls: 'num', sort: cost, cell: (p) => (cost(p) ? ui.money(cost(p)) : '') },
      { label: 'Needed by', sort: (p) => p.neededBy || '9999', cell: (p) => (p.neededBy ? ui.fmtShort(p.neededBy) : '') },
      { label: 'Sub-team', sort: (p) => p.team, cell: (p) => p.team },
      { label: 'Buyer', cell: (p) => p.assignee },
      { label: 'Link', cell: (p) => (/^https?:\/\//i.test(p.link) ? h('a', { href: p.link, target: '_blank', rel: 'noopener noreferrer', onclick: (e) => e.stopPropagation() }, 'Open') : '') },
      { label: 'Status', sort: (p) => p.status, cell: (p) => statusSelect('part', 'parts', p, C.partStatus) }
    ];
    const stat = (n, l) => h('div', { class: 'card stat' }, h('div', { class: 'num' }, n), h('div', { class: 'lbl' }, l));
    root.append(
      pageHead('Parts & Supplies', 'The shopping list', addBtn('part', 'Item', () => App.forms.part(null))),
      h('div', { class: 'grid grid-4', style: { marginBottom: '14px' } }, stat(count('Needed'), 'Still needed'), stat(count('Ordered'), 'On order'), stat(count('Received'), 'Received'), stat(ui.money(open), 'Estimated cost, not yet received')),
      h('div', { class: 'toolbar' },
        searchBox(pt, 'Filter items'),
        seg([['', 'All'], ['Needed', 'Needed'], ['Ordered', 'Ordered'], ['Received', 'Received']], pt.status, (v) => { pt.status = v; App.render(); }),
        selectOf('Sub-team', pt.team, [{ value: '', label: 'All sub-teams' }, ...C.teams], (v) => { pt.team = v; App.render(); }),
        h('span', { class: 'spacer' }),
        btn('Download CSV', 'download', () => App.exportPartsCsv(rows)), btn('Print', 'print', () => window.print())),
      table(cols, rows, pt.sort, (p) => App.forms.part(p.id), 'No items match.'));
  };

  /* ======================= NEWS ======================= */
  views.news = function (root) {
    const posts = store.state.news.slice().sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.localeCompare(a.date));
    root.append(
      pageHead('News', 'Team announcements', addBtn('news', 'Post', () => App.forms.news(null))),
      posts.length ? posts.map((n) => h('article', { class: 'card post' },
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'flex-start' } },
          h('div', { style: { flex: 1 } }, h('h2', null, n.title, n.pinned && h('span', { class: 'pin' }, 'PINNED')), h('div', { class: 'meta' }, `${ui.fmtDate(n.date)}${n.author ? ' by ' + n.author : ''}`)),
          auth.level('news', n) !== 'view' && btn('Edit', null, () => App.forms.news(n.id), 'btn-small')),
        h('div', { class: 'body' }, n.body))) : h('div', { class: 'card empty' }, 'No posts yet.'));
  };

  /* ======================= SEARCH ======================= */
  views.search = function (root, params) {
    const q = (params.q || '').trim();
    const st = store.state;
    const sections = [
      ['Events', st.events.filter((e) => ui.contains(e, q)), (e) => [e.title, ui.fmtRange(e.start, e.end)], (e) => App.forms.event(e.id)],
      ['Tasks', st.tasks.filter((t) => ui.contains(t, q)), (t) => [t.title, `${t.team}, ${ui.fmtRange(t.start, t.end)}`], (t) => App.forms.task(t.id)],
      ['Parts & Supplies', st.parts.filter((p) => ui.contains(p, q)), (p) => [p.name, `${p.status}${p.vendor ? ', ' + p.vendor : ''}`], (p) => App.forms.part(p.id)],
      ['News', st.news.filter((n) => ui.contains(n, q)), (n) => [n.title, ui.fmtDate(n.date)], () => { location.hash = '#/news'; }]
    ].filter((s) => s[1].length);
    root.append(
      pageHead(q ? `Search: ${q}` : 'Search', q ? null : 'Type in the box at the top'),
      q && !sections.length ? h('div', { class: 'card empty' }, 'Nothing found.') : sections.map(([name, items, label, open]) =>
        h('section', { class: 'card', style: { marginBottom: '14px' } }, h('div', { class: 'card-head' }, h('h2', null, `${name} (${items.length})`)),
          h('ul', { class: 'list' }, items.slice(0, 25).map((o) => { const [a, b] = label(o); return h('li', { onclick: () => open(o) }, h('strong', null, a), h('span', { class: 'muted' }, b)); })))));
  };
})();
