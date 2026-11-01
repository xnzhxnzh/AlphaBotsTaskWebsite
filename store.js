/* Data store: everything lives in the browser (localStorage). Export/import JSON moves it between devices. */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  const KEY = 'alphabots-schedule-v1';

  const C = (App.C = {
    groups: ['Mentors & Coaches', 'Drive Team', 'Build Team', 'Programming Team', 'CAD & Design Team', 'Outreach & Business Team'],
    teams: ['Whole team', 'Build', 'Programming', 'CAD / Design', 'Drive Team', 'Outreach', 'Business / Fundraising', 'Portfolio'],
    eventKinds: ['Team meeting', 'Build / practice', 'Scrimmage', 'League meet', 'Qualifier', 'League tournament', 'Championship', 'Outreach', 'Fundraiser', 'Other'],
    eventStatus: ['New', 'Confirmed', 'Done', 'Cancelled'],
    taskStatus: ['New', 'In progress', 'On hold', 'Done'],
    partStatus: ['Needed', 'Ordered', 'Received'],
    kindColor: {
      'Team meeting': '#1971c2', 'Build / practice': '#2f9e44', 'Scrimmage': '#e8590c', 'League meet': '#7048e8',
      'Qualifier': '#c2255c', 'League tournament': '#9c36b5', 'Championship': '#d9480f', 'Outreach': '#0c8599',
      'Fundraiser': '#5c940d', 'Other': '#495057'
    },
    taskColor: '#3b5bdb', milestoneColor: '#e03131', partColor: '#f08c00'
  });
  const COLLECTIONS = ['people', 'events', 'tasks', 'parts', 'news'];
  const ROLE_IDS = ['admin', 'mentor', 'lead', 'student'];
  const ACCOUNT_STATUS = ['approved', 'pending', 'disabled'];

  /* ---------- date helpers (dates are 'YYYY-MM-DD' strings, handled in local time) ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const today = () => iso(new Date());
  const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s));
  App.date = { pad, iso, parse, addDays, diffDays, today, isDate };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  function nextSaturday(weeksAhead) {
    const t = today();
    const dow = parse(t).getDay();
    return addDays(t, ((6 - dow + 7) % 7) + 7 * weeksAhead);
  }

  /* ---------- starter data, clearly marked as examples ---------- */
  function seedBase() {
    const t = today();
    const d = (n) => addDays(t, n);
    const s1 = nextSaturday(1), s2 = nextSaturday(2), s3 = nextSaturday(3), s6 = nextSaturday(6), s9 = nextSaturday(9);
    const ex = (o) => Object.assign({ id: uid(), example: true }, o);
    return {
      version: 1,
      settings: { teamName: 'Alphabots', teamNumber: '16026', groups: C.groups.slice(), autoShift: true },
      accounts: [],
      people: [
        ex({ name: 'Example Mentor', group: 'Mentors & Coaches', role: 'Head coach', contact: '', notes: '' }),
        ex({ name: 'Example Driver', group: 'Drive Team', role: 'Driver', contact: '', notes: '' }),
        ex({ name: 'Example Builder', group: 'Build Team', role: 'Build lead', contact: '', notes: '' }),
        ex({ name: 'Example Programmer', group: 'Programming Team', role: 'Software lead', contact: '', notes: '' }),
        ex({ name: 'Example Designer', group: 'CAD & Design Team', role: 'CAD lead', contact: '', notes: '' }),
        ex({ name: 'Example Outreach Lead', group: 'Outreach & Business Team', role: 'Outreach', contact: '', notes: '' })
      ],
      events: [
        ex({ title: 'Build & practice night', kind: 'Build / practice', team: 'Whole team', start: d(2), end: d(2), startTime: '18:00', endTime: '21:00', location: 'Workshop', assignee: 'Example Mentor', status: 'Confirmed', notes: '' }),
        ex({ title: 'Scrimmage with a partner team', kind: 'Scrimmage', team: 'Drive Team', start: s1, end: s1, startTime: '09:00', endTime: '14:00', location: "Partner team's school", assignee: 'Drive Team', status: 'Confirmed', notes: 'Bring: robot, batteries, chargers, driver station, tools, spare parts.' }),
        ex({ title: 'Outreach demo at an elementary school', kind: 'Outreach', team: 'Outreach', start: s2, end: s2, startTime: '10:00', endTime: '12:00', location: 'TBD', assignee: 'Outreach & Business Team', status: 'New', notes: '' }),
        ex({ title: 'League Meet 1', kind: 'League meet', team: 'Whole team', start: s3, end: s3, startTime: '08:00', endTime: '16:00', location: 'TBD', assignee: 'Drive Team', status: 'New', notes: '' }),
        ex({ title: 'League Meet 2', kind: 'League meet', team: 'Whole team', start: s6, end: s6, startTime: '08:00', endTime: '16:00', location: 'TBD', assignee: 'Drive Team', status: 'New', notes: '' }),
        ex({ title: 'Qualifier', kind: 'Qualifier', team: 'Whole team', start: s9, end: s9, startTime: '', endTime: '', location: 'TBD', assignee: 'Drive Team', status: 'New', notes: '' })
      ],
      tasks: [
        ex({ title: 'Finalize drivetrain CAD', team: 'CAD / Design', start: d(1), end: d(5), primary: ['CAD & Design Team'], members: [], status: 'In progress', progress: 60, milestone: false, notes: '' }),
        ex({ title: 'Build drivetrain', team: 'Build', start: d(6), end: d(12), primary: ['Build Team'], members: [], status: 'New', progress: 0, milestone: false, notes: '' }),
        ex({ title: 'Program TeleOp controls', team: 'Programming', start: d(3), end: d(10), primary: ['Programming Team'], members: [], status: 'New', progress: 0, milestone: false, notes: '' }),
        ex({ title: 'Program autonomous routine', team: 'Programming', start: d(11), end: addDays(s3, -2), primary: ['Programming Team'], members: [], status: 'New', progress: 0, milestone: false, notes: '' }),
        ex({ title: 'Driver practice', team: 'Drive Team', start: s2, end: s2, primary: ['Drive Team'], members: [], status: 'New', progress: 0, milestone: false, notes: '' }),
        ex({ title: 'Update engineering portfolio', team: 'Portfolio', start: t, end: s2, primary: ['Outreach & Business Team'], members: [], status: 'In progress', progress: 25, milestone: false, notes: '' }),
        ex({ title: 'Team registration and fees due', team: 'Business / Fundraising', start: d(7), end: d(7), primary: ['Example Mentor'], members: [], status: 'New', progress: 0, milestone: true, notes: '' }),
        ex({ title: 'Robot competition-ready', team: 'Whole team', start: addDays(s3, -1), end: addDays(s3, -1), primary: [], members: [], status: 'New', progress: 0, milestone: true, notes: '' }),
        ex({ title: 'Portfolio final draft due', team: 'Portfolio', start: addDays(s3, -3), end: addDays(s3, -3), primary: [], members: [], status: 'New', progress: 0, milestone: true, notes: '' })
      ],
      parts: [
        ex({ name: 'Drive motors', qty: 4, vendor: 'goBILDA', partNo: '', unitCost: 0, link: '', neededBy: s1, team: 'Build', assignee: 'Build Team', status: 'Needed', notes: '' }),
        ex({ name: 'Spare 12V battery', qty: 2, vendor: 'REV Robotics', partNo: '', unitCost: 0, link: '', neededBy: s1, team: 'Drive Team', assignee: '', status: 'Ordered', notes: '' }),
        ex({ name: 'Zip ties and M4 screws', qty: 1, vendor: 'Hardware store', partNo: '', unitCost: 0, link: '', neededBy: '', team: 'Build', assignee: '', status: 'Received', notes: '' }),
        ex({ name: 'Pit display banner', qty: 1, vendor: '', partNo: '', unitCost: 0, link: '', neededBy: addDays(s3, -3), team: 'Outreach', assignee: 'Outreach & Business Team', status: 'Needed', notes: '' })
      ],
      news: [
        ex({ title: 'Welcome to the team schedule', body: 'This is our season hub.\n\n- Calendar: everything coming up in one place.\n- Parts & Supplies: the shopping list. Add what we need, then mark it Ordered or Received.\n- News: team announcements like this one.\n\nUse Settings to rename the team, add your own people, and remove these example items.', author: 'Example Mentor', date: t, pinned: true })
      ]
    };
  }

  // Example dependencies (matched by title because ids are made fresh each time).
  function seed() {
    const s = seedBase();
    const task = (title) => s.tasks.find((t) => t.title === title);
    task('Build drivetrain').waitsFor = [task('Finalize drivetrain CAD').id];
    task('Program autonomous routine').waitsFor = [task('Program TeleOp controls').id];
    task('Robot competition-ready').waitsFor = [task('Build drivetrain').id, task('Program autonomous routine').id];
    return s;
  }
  // Drops dependency links that point at missing tasks, at the task itself, or that would form a loop.
  function cleanDependencies(tasks) {
    const ids = new Set(tasks.map((t) => t.id));
    const graph = new Map(tasks.map((t) => [t.id, []]));
    const reaches = (from, target) => { const seen = new Set(), stack = [from]; while (stack.length) { const id = stack.pop(); if (id === target) return true; if (seen.has(id)) continue; seen.add(id); stack.push(...(graph.get(id) || [])); } return false; };
    for (const t of tasks) {
      const keep = [];
      for (const p of t.waitsFor) {
        if (!ids.has(p) || p === t.id || reaches(p, t.id)) continue; // missing, itself, or would loop
        keep.push(p); graph.get(t.id).push(p);
      }
      t.waitsFor = keep;
    }
  }
  /* ---------- load, save, validate ---------- */
  const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max || 2000);
  const optDate = (v) => (isDate(v) ? v : '');
  const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);

  // A task has primary people (the leads) and sub-people (helpers). Each entry is a person's name or a whole group.
  // Older data had a single `assignee`; it becomes the first primary person.
  const nameList = (v) => (Array.isArray(v) ? [...new Set(v.map((s) => str(s, 80).trim()).filter(Boolean))].slice(0, 40) : []);
  function peopleOf(o) {
    let primary = nameList(o.primary), members = nameList(o.members);
    if (!primary.length && !members.length && o.assignee) primary = [str(o.assignee, 80).trim()].filter(Boolean);
    members = members.filter((n) => !primary.includes(n));
    return { primary, members, all: [...primary, ...members] };
  }
  App.taskPeople = peopleOf;
  // Rebuilds a state object from untrusted JSON (localStorage or an imported file), dropping anything unexpected.
  function sanitize(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('That file is not a schedule backup.');
    for (const k of COLLECTIONS) if (raw[k] != null && !Array.isArray(raw[k])) throw new Error(`"${k}" must be a list.`);
    const s = raw.settings || {};
    const groups = Array.isArray(s.groups) ? s.groups.map((g) => str(g, 60).trim()).filter(Boolean).slice(0, 30) : C.groups.slice();
    const out = {
      version: 1,
      settings: { teamName: str(s.teamName, 60) || 'Alphabots', teamNumber: str(s.teamNumber, 20), groups: groups.length ? groups : C.groups.slice(), autoShift: s.autoShift !== false },
      accounts: [], people: [], events: [], tasks: [], parts: [], news: []
    };
    if (raw.accounts != null && !Array.isArray(raw.accounts)) throw new Error('"accounts" must be a list.');
    const seen = new Set();
    let haveAdmin = false;
    for (const o of raw.accounts || []) {
      const username = str(o.username, 40).trim().toLowerCase();
      if (!username || seen.has(username)) continue;
      seen.add(username);
      let role = oneOf(o.role, ROLE_IDS, 'student');
      if (role === 'admin') { if (haveAdmin) role = 'student'; haveAdmin = true; } // exactly one admin
      out.accounts.push({ id: str(o.id, 40) || uid(), username, name: str(o.name, 80) || username, role,
        status: role === 'admin' ? 'approved' : oneOf(o.status, ACCOUNT_STATUS, 'pending'), group: str(o.group, 60),
        salt: str(o.salt, 100), hash: str(o.hash, 200), iter: Math.min(1000000, Math.max(1000, Number(o.iter) || 150000)),
        mustChange: o.mustChange === true, created: str(o.created, 30) });
    }
    const base = (o) => ({ id: str(o.id, 40) || uid(), example: o.example === true });
    for (const o of raw.people || []) out.people.push({ ...base(o), name: str(o.name, 80), group: str(o.group, 60), role: str(o.role, 80), contact: str(o.contact, 120), notes: str(o.notes) });
    for (const o of raw.events || []) {
      const start = optDate(o.start); if (!start) continue;
      out.events.push({ ...base(o), title: str(o.title, 120), kind: oneOf(o.kind, C.eventKinds, 'Other'), team: str(o.team, 60), start, end: optDate(o.end) || start,
        startTime: /^\d{2}:\d{2}$/.test(o.startTime) ? o.startTime : '', endTime: /^\d{2}:\d{2}$/.test(o.endTime) ? o.endTime : '',
        location: str(o.location, 120), assignee: str(o.assignee, 80), status: oneOf(o.status, C.eventStatus, 'New'), notes: str(o.notes) });
    }
    for (const o of raw.tasks || []) {
      const start = optDate(o.start); if (!start) continue;
      const milestone = o.milestone === true;
      const who = peopleOf(o);
      out.tasks.push({ ...base(o), title: str(o.title, 120), team: str(o.team, 60), start, end: milestone ? start : optDate(o.end) || start, primary: who.primary, members: who.members, waitsFor: nameList(o.waitsFor),
        status: oneOf(o.status, C.taskStatus, 'New'), progress: Math.min(100, Math.max(0, Number(o.progress) || 0)), milestone, notes: str(o.notes) });
    }
    for (const o of raw.parts || []) out.parts.push({ ...base(o), name: str(o.name, 120), qty: Math.max(0, Number(o.qty) || 0), vendor: str(o.vendor, 80), partNo: str(o.partNo, 80),
      unitCost: Math.max(0, Number(o.unitCost) || 0), link: str(o.link, 500), neededBy: optDate(o.neededBy), team: str(o.team, 60), assignee: str(o.assignee, 80),
      status: oneOf(o.status, C.partStatus, 'Needed'), notes: str(o.notes) });
    cleanDependencies(out.tasks);
    for (const o of raw.news || []) out.news.push({ ...base(o), title: str(o.title, 140), body: str(o.body, 10000), author: str(o.author, 80), date: optDate(o.date) || today(), pinned: o.pinned === true });
    return out;
  }

  let state;
  let storageOk = true;
  try {
    const saved = localStorage.getItem(KEY);
    state = saved ? sanitize(JSON.parse(saved)) : seed();
  } catch (e) {
    state = seed();
  }
  const listeners = [];

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; }
    catch (e) { storageOk = false; if (App.ui) App.ui.toast('Could not save in this browser. Use Settings > Export backup to keep your data.'); }
    listeners.forEach((fn) => fn());
  }

  App.store = {
    get state() { return state; },
    get storageOk() { return storageOk; },
    onChange(fn) { listeners.push(fn); },
    persist() { save(); }, // after changing state in place
    list(coll) { return state[coll]; },
    find(coll, id) { return state[coll].find((o) => o.id === id); },
    upsert(coll, obj) {
      const i = obj.id ? state[coll].findIndex((o) => o.id === obj.id) : -1;
      if (i >= 0) state[coll][i] = obj; else { obj.id = uid(); state[coll].push(obj); }
      save();
      return obj;
    },
    remove(coll, id) {
      state[coll] = state[coll].filter((o) => o.id !== id);
      if (coll === 'tasks') state.tasks.forEach((t) => { t.waitsFor = (t.waitsFor || []).filter((p) => p !== id); }); // nothing waits for a deleted task
      save();
    },
    replaceAll(raw) { const keep = state.accounts; state = sanitize(raw); if (!state.accounts.length) state.accounts = keep; save(); },
    reset() { const keep = state.accounts, s = state.settings; state = seed(); state.accounts = keep; state.settings = s; save(); },
    clearAll() { const s = state.settings, keep = state.accounts; state = sanitize({ settings: s }); state.accounts = keep; save(); },
    removeExamples() { for (const k of COLLECTIONS) state[k] = state[k].filter((o) => !o.example); save(); },
    hasExamples() { return COLLECTIONS.some((k) => state[k].some((o) => o.example)); },
    saveSettings(patch) { Object.assign(state.settings, patch); save(); },
    groups() { return state.settings.groups; },
    assignees() {
      const names = [...state.people.map((p) => p.name), ...state.accounts.filter((a) => a.status === 'approved').map((a) => a.name)].filter(Boolean);
      return [...state.settings.groups, ...new Set(names)];
    },
    exportJson() { return JSON.stringify(state, null, 2); }
  };
})();
