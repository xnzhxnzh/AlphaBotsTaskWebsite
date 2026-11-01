/* Create/edit forms for every item type. Each saves through the store, then asks the app to redraw. */
(function () {
  'use strict';
  const App = window.App, C = App.C, D = App.date, store = App.store, ui = App.ui;
  const forms = (App.forms = {});

  const assigneeOptions = (current) => {
    const opts = ['', ...store.assignees()];
    if (current && !opts.includes(current)) opts.push(current); // keep an old value that was since renamed
    return opts.map((o) => ({ value: o, label: o || 'Unassigned' }));
  };
  const teamOptions = () => C.teams.map((t) => ({ value: t, label: t }));
  const h = ui.h;
  const done = (msg) => { ui.toast(msg); App.render(); };
  // What may the signed-in user do with this item? Returns null (and explains) when they cannot even create one.
  const access = (type, cur) => {
    if (!cur && !App.auth.canCreate(type)) { ui.toast('Your role cannot add this.'); return null; }
    return { level: cur ? App.auth.level(type, cur) : 'full' };
  };

  /* People picker for tasks: a Primary list (leads) and a Sub-people list (helpers).
     Entries are individual people or whole groups. Click a name to swap it between the lists, x removes it. */
  let pickerCount = 0;
  function peoplePicker(initial) {
    const state = { primary: (initial.primary || []).slice(), members: (initial.members || []).slice() };
    const uid = 'pk' + ++pickerCount;
    let disabled = false;
    const root = h('div', { class: 'picker' });
    const SECTIONS = [['primary', 'Primary', 'Own the task. Shown first on the chart.'], ['members', 'Sub-people', 'Helpers on the task.']];
    const options = () => { const o = store.assignees(); [...state.primary, ...state.members].forEach((n) => { if (!o.includes(n)) o.push(n); }); return o; };
    const isGroup = (n) => store.groups().includes(n);

    function add(list, raw, input) {
      const value = options().find((o) => o.toLowerCase() === String(raw).trim().toLowerCase());
      if (!value) { if (String(raw).trim()) ui.toast('Pick a name from the list.'); return; }
      const other = list === 'primary' ? 'members' : 'primary';
      state[other] = state[other].filter((n) => n !== value);
      if (!state[list].includes(value)) state[list].push(value);
      draw(list);
    }
    const remove = (list, name) => { state[list] = state[list].filter((n) => n !== name); draw(); };
    const swap = (list, name) => {
      const other = list === 'primary' ? 'members' : 'primary';
      state[list] = state[list].filter((n) => n !== name); state[other].push(name); draw();
    };

    function draw(focusList) {
      root.replaceChildren(...SECTIONS.map(([list, title, hint]) => {
        const taken = new Set(state[list]);
        const dl = h('datalist', { id: `${uid}-${list}` }, options().filter((o) => !taken.has(o)).map((o) => h('option', { value: o })));
        const input = h('input', { type: 'text', list: `${uid}-${list}`, placeholder: 'Type a name or team, then Enter', 'aria-label': `Add to ${title}`, autocomplete: 'off', maxlength: 80,
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(list, input.value); } },
          onchange: () => { if (options().some((o) => o.toLowerCase() === input.value.trim().toLowerCase())) add(list, input.value); } });
        const chips = state[list].length
          ? state[list].map((n) => h('span', { class: 'chip' + (isGroup(n) ? ' team' : '') },
            h('button', { type: 'button', class: 'chip-name', disabled, title: `Click to move to ${list === 'primary' ? 'Sub-people' : 'Primary'}`, onclick: () => swap(list, n) }, n, isGroup(n) && h('small', null, ' team')),
            h('button', { type: 'button', class: 'chip-x', disabled, 'aria-label': `Remove ${n}`, onclick: () => remove(list, n) }, '×')))
          : h('span', { class: 'muted' }, 'Nobody yet');
        const block = h('div', { class: 'picker-block' },
          h('div', { class: 'picker-title' }, h('strong', null, title), h('span', { class: 'muted' }, ' ' + hint)),
          h('div', { class: 'chips' }, chips),
          !disabled && h('div', { class: 'picker-add' }, input, h('button', { type: 'button', class: 'btn btn-small', onclick: () => add(list, input.value) }, 'Add'), dl));
        if (focusList === list) setTimeout(() => input.focus(), 0);
        return block;
      }));
    }
    draw();
    return { node: root, get: () => ({ primary: state.primary.slice(), members: state.members.slice() }), setDisabled(v) { disabled = v; draw(); } };
  }
  /* "Waits for" picker: the tasks that must finish before this one can start. */
  function depsPicker(taskId, initial) {
    let ids = (initial || []).filter((i) => store.find('tasks', i));
    let disabled = false;
    const uid = 'dp' + ++pickerCount;
    const root = h('div', { class: 'picker' });
    // A readable, unique label per task: "Title (Nov 5 to Nov 9)". Same title twice? the date range tells them apart.
    const label = (t) => `${t.title} (${ui.fmtRange(t.start, t.end)})`;
    const candidates = () => store.state.tasks.filter((t) => t.id !== taskId && !ids.includes(t.id));

    function add(raw) {
      const text = String(raw).trim().toLowerCase();
      if (!text) return;
      const t = candidates().find((c) => label(c).toLowerCase() === text) || candidates().find((c) => c.title.toLowerCase() === text);
      if (!t) return ui.toast('Pick a task from the list.');
      if (App.deps.wouldCycle(taskId, t.id)) return ui.toast(`"${t.title}" already waits for this task, so that would make a loop.`);
      ids.push(t.id);
      draw(true);
    }
    function draw(focus) {
      const dl = h('datalist', { id: uid }, candidates().map((t) => h('option', { value: label(t) })));
      const input = h('input', { type: 'text', list: uid, placeholder: 'Type a task name, then Enter', 'aria-label': 'Add a task to wait for', autocomplete: 'off', maxlength: 160,
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); add(input.value); } },
        onchange: () => { if (candidates().some((c) => label(c).toLowerCase() === input.value.trim().toLowerCase())) add(input.value); } });
      const chips = ids.length
        ? ids.map((i) => { const t = store.find('tasks', i); return h('span', { class: 'chip' }, h('span', { class: 'chip-label' }, label(t)),
          h('button', { type: 'button', class: 'chip-x', disabled, 'aria-label': `Stop waiting for ${t.title}`, onclick: () => { ids = ids.filter((x) => x !== i); draw(); } }, '×')); })
        : h('span', { class: 'muted' }, 'Nothing. This task can start any time.');
      root.replaceChildren(h('div', { class: 'picker-block' }, h('div', { class: 'chips' }, chips),
        !disabled && h('div', { class: 'picker-add' }, input, h('button', { type: 'button', class: 'btn btn-small', onclick: () => add(input.value) }, 'Add'), dl)));
      if (focus) setTimeout(() => input.focus(), 0);
    }
    draw();
    return { node: root, get: () => ids.slice(), setDisabled(v) { disabled = v; draw(); } };
  }

  forms.event = function (id, defaults) {
    const cur = id ? store.find('events', id) : null;
    const a = access('event', cur);
    if (!a) return;
    const v = cur || Object.assign({ title: '', kind: 'Team meeting', team: 'Whole team', start: D.today(), end: '', startTime: '', endTime: '', location: '', assignee: '', status: 'New', notes: '' }, defaults);
    ui.form({
      title: cur ? 'Edit event' : 'New event',
      values: v,
      readOnly: a.level === 'view',
      editable: a.level === 'status' ? ['status', 'progress'] : null,
      fields: [
        { name: 'title', label: 'Title', required: true, full: true, placeholder: 'Build night, League Meet 1, ...' },
        { name: 'kind', label: 'Event kind', type: 'select', options: C.eventKinds },
        { name: 'status', label: 'Status', type: 'select', options: C.eventStatus },
        { name: 'start', label: 'Start date', type: 'date', required: true },
        { name: 'end', label: 'End date', type: 'date', help: 'Leave empty for a one-day event.' },
        { name: 'startTime', label: 'Start time', type: 'time' },
        { name: 'endTime', label: 'End time', type: 'time' },
        { name: 'location', label: 'Location', full: true },
        { name: 'team', label: 'Sub-team', type: 'select', options: teamOptions() },
        { name: 'assignee', label: 'Responsible', type: 'select', options: assigneeOptions(v.assignee) },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, placeholder: 'What to bring, who is driving, ...' }
      ],
      onSubmit(o) {
        if (!D.isDate(o.start)) return 'Pick a valid start date.';
        if (o.end && !D.isDate(o.end)) return 'Pick a valid end date.';
        if (o.end && o.end < o.start) return 'The end date is before the start date.';
        store.upsert('events', Object.assign({}, cur, o, { end: o.end || o.start }));
        done(cur ? 'Event saved' : 'Event added');
      },
      onDelete: cur && a.level === 'full' && (() => { store.remove('events', cur.id); done('Event deleted'); })
    });
  };

  forms.task = function (id, defaults) {
    const cur = id ? store.find('tasks', id) : null;
    const a = access('task', cur);
    if (!a) return;
    const v = cur || Object.assign({ title: '', team: 'Build', start: D.today(), end: '', primary: [], members: [], status: 'New', progress: 0, milestone: false, notes: '' }, defaults);
    ui.form({
      title: cur ? (cur.milestone ? 'Edit deadline' : 'Edit task') : v.milestone ? 'New deadline' : 'New task',
      values: Object.assign({}, v, { people: App.taskPeople(v), waitsFor: v.waitsFor || [] }),
      readOnly: a.level === 'view',
      editable: a.level === 'status' ? ['status', 'progress'] : null,
      fields: [
        { name: 'title', label: 'Title', required: true, full: true },
        { name: 'milestone', label: 'Deadline / milestone', type: 'checkbox', help: 'A single date, shown as a diamond on the timeline.' },
        { name: 'team', label: 'Sub-team', type: 'select', options: teamOptions() },
        { name: 'status', label: 'Status', type: 'select', options: C.taskStatus },
        { name: 'start', label: 'Start / due date', type: 'date', required: true },
        { name: 'end', label: 'Finish date', type: 'date', help: 'Ignored for deadlines.' },
        { name: 'people', label: 'People', type: 'custom', build: peoplePicker, help: 'Add individual students or whole teams to either list. Click a name to move it between the lists.' },
        { name: 'waitsFor', label: 'Waits for', type: 'custom', build: (ids) => depsPicker(cur ? cur.id : null, ids), help: 'Tasks that must finish before this one can start. The Gantt chart draws an arrow from each of them.' },
        { name: 'progress', label: 'Progress %', type: 'number', min: 0, max: 100, step: 5 },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true }
      ],
      onSubmit(o) {
        if (!D.isDate(o.start)) return 'Pick a valid start date.';
        if (o.end && !D.isDate(o.end)) return 'Pick a valid finish date.';
        if (!o.milestone && o.end && o.end < o.start) return 'The finish date is before the start date.';
        const progress = Math.min(100, Math.max(0, Number(o.progress) || 0));
        const { people, ...rest } = o;
        const saved = Object.assign({}, cur, rest, { primary: people.primary, members: people.members, end: o.milestone ? o.start : o.end || o.start, progress: o.status === 'Done' ? 100 : progress });
        delete saved.assignee;
        const stored = store.upsert('tasks', saved);
        const note = App.deps.afterEdit(stored.id);
        done(note ? 'Saved. ' + note : 'Saved');
      },
      onDelete: cur && a.level === 'full' && (() => { store.remove('tasks', cur.id); done('Deleted'); })
    });
  };

  forms.part = function (id, defaults) {
    const cur = id ? store.find('parts', id) : null;
    const a = access('part', cur);
    if (!a) return;
    const v = cur || Object.assign({ name: '', qty: 1, vendor: '', partNo: '', unitCost: '', link: '', neededBy: '', team: 'Build', assignee: '', status: 'Needed', notes: '' }, defaults);
    ui.form({
      title: cur ? 'Edit part or supply' : 'New part or supply',
      values: v,
      readOnly: a.level === 'view',
      editable: a.level === 'status' ? ['status', 'progress'] : null,
      fields: [
        { name: 'name', label: 'Item', required: true, full: true, placeholder: 'Drive motors, zip ties, banner, ...' },
        { name: 'qty', label: 'Quantity', type: 'number', min: 0, step: 1 },
        { name: 'status', label: 'Status', type: 'select', options: C.partStatus },
        { name: 'vendor', label: 'Vendor' },
        { name: 'partNo', label: 'Part number' },
        { name: 'unitCost', label: 'Unit cost ($)', type: 'number', min: 0, step: 0.01 },
        { name: 'neededBy', label: 'Needed by', type: 'date' },
        { name: 'link', label: 'Purchase link', type: 'url', full: true, placeholder: 'https://' },
        { name: 'team', label: 'Sub-team', type: 'select', options: teamOptions() },
        { name: 'assignee', label: 'Who buys it', type: 'select', options: assigneeOptions(v.assignee) },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true }
      ],
      onSubmit(o) {
        if (o.neededBy && !D.isDate(o.neededBy)) return 'Pick a valid date.';
        if (o.link && !/^https?:\/\//i.test(o.link)) return 'The link must start with http:// or https://';
        store.upsert('parts', Object.assign({}, cur, o, { qty: Number(o.qty) || 0, unitCost: Number(o.unitCost) || 0 }));
        done('Saved');
      },
      onDelete: cur && a.level === 'full' && (() => { store.remove('parts', cur.id); done('Deleted'); })
    });
  };

  forms.person = function (id, defaults) {
    const cur = id ? store.find('people', id) : null;
    const a = access('person', cur);
    if (!a) return;
    const v = cur || Object.assign({ name: '', group: store.groups()[0] || '', role: '', contact: '', notes: '' }, defaults);
    const groups = store.groups().slice();
    if (v.group && !groups.includes(v.group)) groups.push(v.group);
    ui.form({
      title: cur ? 'Edit person' : 'New person',
      values: v,
      readOnly: a.level === 'view',
      editable: a.level === 'status' ? ['status', 'progress'] : null,
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'group', label: 'Group', type: 'select', options: groups },
        { name: 'role', label: 'Role', placeholder: 'Captain, driver, coach, ...' },
        { name: 'contact', label: 'Contact', placeholder: 'Email or phone' },
        { name: 'notes', label: 'Notes', type: 'textarea', full: true, placeholder: 'Usually available, skills, ...' }
      ],
      onSubmit(o) { store.upsert('people', Object.assign({}, cur, o)); done('Saved'); },
      onDelete: cur && a.level === 'full' && (() => { store.remove('people', cur.id); done('Deleted'); })
    });
  };

  forms.news = function (id) {
    const cur = id ? store.find('news', id) : null;
    const a = access('news', cur);
    if (!a) return;
    const v = cur || { title: '', body: '', author: '', date: D.today(), pinned: false };
    ui.form({
      title: cur ? 'Edit post' : 'New post',
      values: v,
      readOnly: a.level === 'view',
      editable: a.level === 'status' ? ['status', 'progress'] : null,
      fields: [
        { name: 'title', label: 'Title', required: true, full: true },
        { name: 'body', label: 'Post', type: 'textarea', full: true, required: true },
        { name: 'pinned', label: 'Pin to the top', type: 'checkbox' }
      ],
      onSubmit(o) {
        const me = App.auth.current();
        store.upsert('news', Object.assign({}, cur, o, { date: cur ? cur.date : D.today(), author: cur ? cur.author : me ? me.name : '' }));
        done('Posted');
      },
      onDelete: cur && a.level === 'full' && (() => { store.remove('news', cur.id); done('Deleted'); })
    });
  };

  const byType = { event: 'event', task: 'task', milestone: 'task', part: 'part', person: 'person', news: 'news' };
  forms.edit = (type, id) => forms[byType[type]](id);
})();
