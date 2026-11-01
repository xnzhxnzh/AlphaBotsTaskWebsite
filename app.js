/* App shell: sign-in gate, router, header, sidebar, exports. */
(function () {
  'use strict';
  const App = window.App, store = App.store, ui = App.ui, h = ui.h, auth = App.auth, D = App.date;
  const $ = (id) => document.getElementById(id);

  /* ---------- exports ---------- */
  const icsEsc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
  App.exportIcs = function () {
    const st = store.state, stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const compact = (d) => d.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Alphabots schedule//EN', 'CALSCALE:GREGORIAN'];
    for (const e of st.events.filter((x) => x.status !== 'Cancelled')) {
      lines.push('BEGIN:VEVENT', `UID:${e.id}@alphabots-schedule`, `DTSTAMP:${stamp}`);
      if (e.startTime) {
        lines.push(`DTSTART:${compact(e.start)}T${e.startTime.replace(':', '')}00`, `DTEND:${compact(e.end)}T${(e.endTime || e.startTime).replace(':', '')}00`);
      } else lines.push(`DTSTART;VALUE=DATE:${compact(e.start)}`, `DTEND;VALUE=DATE:${compact(D.addDays(e.end, 1))}`);
      lines.push(`SUMMARY:${icsEsc(e.title)}`, `LOCATION:${icsEsc(e.location)}`, `DESCRIPTION:${icsEsc([e.kind, e.notes].filter(Boolean).join(' - '))}`, 'END:VEVENT');
    }
    for (const t of st.tasks.filter((x) => x.milestone && x.status !== 'Done')) {
      lines.push('BEGIN:VEVENT', `UID:${t.id}@alphabots-schedule`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${compact(t.start)}`, `DTEND;VALUE=DATE:${compact(D.addDays(t.start, 1))}`, `SUMMARY:${icsEsc('Due: ' + t.title)}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    ui.download('alphabots-calendar.ics', lines.join('\r\n') + '\r\n', 'text/calendar');
  };
  App.exportPartsCsv = function (rows) {
    const q = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const head = ['Item', 'Quantity', 'Vendor', 'Part number', 'Unit cost', 'Needed by', 'Sub-team', 'Buyer', 'Status', 'Link'];
    const body = rows.map((p) => [p.name, p.qty, p.vendor, p.partNo, p.unitCost, p.neededBy, p.team, p.assignee, p.status, p.link].map(q).join(','));
    ui.download('parts-list.csv', [head.map(q).join(','), ...body].join('\n') + '\n', 'text/csv');
  };

  /* ---------- router ---------- */
  const NAV = [
    ['home', 'Home', 'home'], ['calendar', 'Calendar', 'calendar'], ['gantt', 'Gantt chart', 'timeline'],
    ['tasks', 'Tasks', 'tasks'], ['parts', 'Parts & Supplies', 'cart'], ['news', 'News', 'news']
  ];
  const ADMIN_NAV = [['accounts', 'Accounts', 'users'], ['settings', 'Settings', 'settings']];

  function route() {
    const raw = location.hash.replace(/^#\/?/, '').replace(/^timeline/, 'gantt');
    const [name, query] = raw.split('?');
    return { name: name || 'home', params: Object.fromEntries(new URLSearchParams(query || '')) };
  }

  App.render = function () {
    const user = auth.current();
    if (!user) return showGate();
    if (user.mustChange) return showForcedPassword();
    $('gate') && $('gate').remove();
    const brand = `${store.state.settings.teamName} ${store.state.settings.teamNumber}`.trim();
    $('brand-name').textContent = brand;
    const { name, params } = route();
    const view = App.views[name] && (!['accounts', 'settings'].includes(name) || auth.isAdmin()) ? name : 'home';
    document.title = (view === 'home' ? '' : (NAV.concat(ADMIN_NAV).find((n) => n[0] === view) || [0, 'Search'])[1] + ' | ') + brand + ' Schedule';
    buildChrome(user, view);
    const root = $('view');
    const scroll = window.scrollY;
    root.replaceChildren();
    try { App.views[view](root, params); } catch (e) { console.error(e); root.append(h('div', { class: 'card empty' }, 'Something went wrong drawing this page: ' + e.message)); }
    window.scrollTo(0, view === window.__lastView ? scroll : 0);
    window.__lastView = view;
  };

  function buildChrome(user, active) {
    const st = store.state, today = D.today();
    const counts = { tasks: st.tasks.filter((t) => !t.milestone && t.status !== 'Done').length, parts: st.parts.filter((p) => p.status === 'Needed').length };
    const pending = st.accounts.filter((a) => a.status === 'pending').length;
    const link = ([id, label, icon]) => h('a', { class: 'nav-link' + (id === active ? ' active' : ''), href: '#/' + (id === 'home' ? '' : id), onclick: closeMenu },
      ui.icon(icon), label, (counts[id] != null || (id === 'accounts' && pending > 0)) && h('span', { class: 'nav-count' }, id === 'accounts' ? `${pending} waiting` : counts[id]));
    $('sidebar').replaceChildren(...NAV.map(link), ...(auth.isAdmin() ? [h('div', { class: 'nav-sep' }), ...ADMIN_NAV.map(link)] : []));

    const create = [['event', 'Event', 'flag', () => App.forms.event(null)], ['task', 'Task', 'tasks', () => App.forms.task(null)], ['task', 'Deadline', 'calendar', () => App.forms.task(null, { milestone: true })],
      ['part', 'Part or supply', 'cart', () => App.forms.part(null)], ['news', 'News post', 'news', () => App.forms.news(null)]]
      .filter(([type]) => auth.canCreate(type));
    $('create-menu').replaceChildren(...create.map(([, label, icon, fn]) => h('button', { type: 'button', onclick: () => { toggleCreate(false); fn(); } }, ui.icon(icon), label)));
    $('create-btn').parentElement.hidden = !create.length;

    const acct = $('account-wrap');
    acct.replaceChildren(
      h('button', { class: 'btn account-btn', type: 'button', id: 'account-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: () => toggleAccount() }, h('span', { class: 'avatar sm' }, ui.initials(user.name)), h('span', { class: 'btn-label' }, user.name)),
      h('div', { class: 'dropdown', id: 'account-menu', hidden: true },
        h('div', { style: { padding: '8px 10px' } }, h('strong', null, user.name), h('div', { class: 'muted' }, `${auth.ROLES[user.role].label}, ${user.username}`)),
        h('button', { type: 'button', onclick: () => { toggleAccount(false); App.changePasswordDialog(); } }, 'Change password'),
        h('button', { type: 'button', onclick: () => { auth.logout(); location.hash = '#/'; App.render(); } }, 'Sign out')));
  }

  /* ---------- menus ---------- */
  function closeMenu() { $('sidebar').classList.remove('open'); $('scrim').classList.remove('show'); $('menu-btn').setAttribute('aria-expanded', 'false'); }
  function toggleCreate(on) { const m = $('create-menu'); m.hidden = on === undefined ? !m.hidden : !on; $('create-btn').setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) toggleAccount(false); }
  function toggleAccount(on) { const m = $('account-menu'); if (!m) return; m.hidden = on === undefined ? !m.hidden : !on; $('account-btn').setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) toggleCreate(false); }

  /* ---------- sign-in gate ---------- */
  function gateShell(title, intro, ...body) {
    $('gate') && $('gate').remove();
    const g = h('div', { class: 'gate', id: 'gate' }, h('div', { class: 'gate-card card' },
      h('div', { class: 'gate-brand' }, h('svg', { viewBox: '0 0 40 40', class: 'brand-logo', 'aria-hidden': 'true' }), h('span', null, `${store.state.settings.teamName} ${store.state.settings.teamNumber}`.trim())),
      h('h1', null, title), intro && h('p', { class: 'muted' }, intro), body,
      h('p', { class: 'muted gate-note' }, 'Accounts are kept in this browser. See the README for what that means.')));
    g.querySelector('svg').innerHTML = '<rect x="2" y="2" width="36" height="36" rx="9" fill="#1e64dc"/><text x="20" y="30" font-size="28" font-weight="700" font-family="Times New Roman,serif" text-anchor="middle" fill="#fff">&#945;</text>';
    document.body.append(g);
    return g;
  }
  const field = (label, input) => h('div', { class: 'field', style: { marginBottom: '10px' } }, h('label', { for: input.id }, label), input);
  const inp = (id, type, extra) => h('input', Object.assign({ id, type: type || 'text', autocomplete: 'off', required: true }, extra));
  const busy = (button, on) => { button.disabled = on; };

  function showGate() {
    document.querySelectorAll('#modal-root > *').forEach((n) => n.remove());
    if (!auth.hasAdmin()) return showSetup();
    let mode = 'in';
    const draw = () => {
      const err = h('div', { class: 'form-error', hidden: true, style: { marginBottom: '10px' } });
      const msg = (m, ok) => { err.textContent = m; err.hidden = false; err.style.color = ok ? 'var(--primary)' : ''; };
      let g;
      if (mode === 'in') {
        const u = inp('g-user', 'text', { autocomplete: 'username' }), p = inp('g-pass', 'password', { autocomplete: 'current-password' });
        const go = h('button', { class: 'btn btn-primary', type: 'submit', style: { width: '100%', justifyContent: 'center' } }, 'Sign in');
        g = gateShell('Sign in', 'Use the username and password from your team admin.',
          h('form', { novalidate: true, onsubmit: async (e) => {
            e.preventDefault(); busy(go, true);
            const r = await auth.login(u.value, p.value);
            busy(go, false);
            if (r.error) return msg(r.error);
            App.render();
          } }, field('Username', u), field('Password', p), err, go),
          h('p', null, 'No account yet? ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); mode = 'req'; draw(); } }, 'Request access')));
        u.focus();
      } else {
        const n = inp('g-name'), u = inp('g-user', 'text'), p = inp('g-pass', 'password', { autocomplete: 'new-password' });
        const go = h('button', { class: 'btn btn-primary', type: 'submit', style: { width: '100%', justifyContent: 'center' } }, 'Send request');
        g = gateShell('Request access', 'The admin has to approve your account before you can sign in.',
          h('form', { novalidate: true, onsubmit: async (e) => {
            e.preventDefault(); busy(go, true);
            let r; try { r = await auth.requestAccess({ name: n.value, username: u.value, password: p.value }); } catch (x) { r = { error: x.message }; }
            busy(go, false);
            if (r.error) return msg(r.error);
            mode = 'in'; draw(); document.querySelector('#gate .gate-card h1').after(h('p', { style: { color: 'var(--primary)', fontWeight: 600 } }, 'Request sent. You can sign in once the admin approves it.'));
          } }, field('Your name', n), field('Choose a username', u), field('Choose a password', p), err, go),
          h('p', null, h('a', { href: '#', onclick: (e) => { e.preventDefault(); mode = 'in'; draw(); } }, 'Back to sign in')));
        n.focus();
      }
    };
    draw();
  }

  function showSetup() {
    const err = h('div', { class: 'form-error', hidden: true, style: { marginBottom: '10px' } });
    const n = inp('s-name'), u = inp('s-user', 'text'), p = inp('s-pass', 'password', { autocomplete: 'new-password' });
    const go = h('button', { class: 'btn btn-primary', type: 'submit', style: { width: '100%', justifyContent: 'center' } }, 'Create admin account');
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { store.replaceAll(JSON.parse(r.result)); if (!auth.hasAdmin()) throw new Error('That backup has no admin account.'); location.reload(); } catch (x) { err.textContent = x.message; err.hidden = false; } };
      r.readAsText(f);
    } });
    gateShell('Set up the admin account', 'This is the first time the site has been opened here. The admin is the highest authority: approves accounts, sets roles, and manages settings. There is exactly one. 15 student accounts are created for you with temporary passwords.',
      h('form', { novalidate: true, onsubmit: async (e) => {
        e.preventDefault(); busy(go, true);
        let r; try { r = await auth.setupAdmin({ name: n.value, username: u.value, password: p.value }); } catch (x) { r = { error: x.message }; }
        busy(go, false);
        if (r.error) { err.textContent = r.error; err.hidden = false; return; }
        App.render();
        App.showCredentials('Student logins (shown once)', r.students);
      } }, field('Your name', n), field('Admin username', u), field('Admin password (8+ characters)', p), err, go),
      h('p', null, 'Moving from another device? ', h('a', { href: '#', onclick: (e) => { e.preventDefault(); file.click(); } }, 'Restore a backup file'), file));
    n.focus();
  }

  function showForcedPassword() {
    const g = gateShell('Choose a new password', 'You are using a temporary password. Pick your own to continue.',
      App.passwordForm({ forced: true, onDone: () => App.render() }));
    g.querySelector('.modal-foot').style.padding = '0';
    g.querySelector('.modal-body').style.cssText = 'padding:0;display:block';
  }

  /* ---------- start ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    $('menu-btn').append(ui.icon('menu'));
    document.querySelector('.search-icon').append(ui.icon('search'));
    ui.mountIcons(document);
    $('menu-btn').addEventListener('click', () => { const open = $('sidebar').classList.toggle('open'); $('scrim').classList.toggle('show', open); $('menu-btn').setAttribute('aria-expanded', String(open)); });
    $('scrim').addEventListener('click', closeMenu);
    $('create-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleCreate(); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.menu-wrap')) { toggleCreate(false); toggleAccount(false); } });
    $('search-form').addEventListener('submit', (e) => { e.preventDefault(); if (auth.current()) location.hash = '#/search?q=' + encodeURIComponent($('search-input').value.trim()); });
    window.addEventListener('hashchange', () => { ui.closeModal(); App.render(); });
    App.render();
  });
})();
