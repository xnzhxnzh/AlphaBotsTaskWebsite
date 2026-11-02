/* Admin-only pages (Accounts, Settings) plus password dialogs used by everyone. */
(function () {
  'use strict';
  const App = window.App, C = App.C, store = App.store, ui = App.ui, h = ui.h, auth = App.auth;
  const views = (App.views = App.views || {});
  const fail = (e) => ui.toast(e && e.message ? e.message : String(e));

  /* ---------- temporary passwords are shown once, here ---------- */
  App.showCredentials = function (title, rows, note) {
    const tbl = h('table', { class: 'tbl' }, h('thead', null, h('tr', null, ['Name', 'Username', 'Temporary password'].map((t) => h('th', null, t)))),
      h('tbody', null, rows.map((r) => h('tr', { style: { cursor: 'default' } }, h('td', null, r.name), h('td', null, h('code', null, r.username)), h('td', null, h('code', null, r.password))))));
    const csv = () => ui.download('logins.csv', 'Name,Username,Temporary password\n' + rows.map((r) => [r.name, r.username, r.password].map((v) => `"${v.replace(/"/g, '""')}"`).join(',')).join('\n') + '\n', 'text/csv');
    const print = () => { document.body.classList.add('print-sheet'); window.print(); setTimeout(() => document.body.classList.remove('print-sheet'), 500); };
    const { close } = ui.dialog(title,
      h('div', { style: { padding: '16px 18px', maxHeight: '60vh', overflow: 'auto' } },
        h('p', { style: { marginTop: 0 } }, note || 'These passwords are shown only now. Hand each one out privately. Everyone must choose a new password the first time they sign in.'), h('div', { class: 'table-wrap' }, tbl)),
      h('div', { class: 'modal-foot' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: print }, [ui.icon('print'), 'Print']),
        h('button', { class: 'btn', type: 'button', onclick: csv }, [ui.icon('download'), 'Download CSV']), h('span', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Done')));
  };

  /* ---------- change password (also the forced first-login screen) ---------- */
  App.passwordForm = function ({ forced, onDone }) {
    const u = auth.current();
    const err = h('div', { class: 'form-error', hidden: true });
    const cur = h('input', { type: 'password', autocomplete: 'current-password', id: 'pw-cur' });
    const nw = h('input', { type: 'password', autocomplete: 'new-password', id: 'pw-new' });
    const again = h('input', { type: 'password', autocomplete: 'new-password', id: 'pw-again' });
    const form = h('form', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      const show = (m) => { err.textContent = m; err.hidden = false; };
      if (nw.value !== again.value) return show('The new passwords do not match.');
      const r = await auth.changePassword(cur.value, nw.value);
      if (r.error) return show(r.error);
      onDone();
    } },
    h('div', { class: 'modal-body' },
      !(forced && u && u.mustChange) && h('div', { class: 'field full' }, h('label', { for: 'pw-cur' }, 'Current password'), cur),
      h('div', { class: 'field full' }, h('label', { for: 'pw-new' }, 'New password'), nw, h('span', { class: 'help' }, 'At least 8 characters.')),
      h('div', { class: 'field full' }, h('label', { for: 'pw-again' }, 'New password again'), again), err),
    h('div', { class: 'modal-foot' }, h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save password'), !forced && h('button', { class: 'btn', type: 'button', onclick: () => ui.closeModal() }, 'Cancel')));
    return form;
  };
  App.changePasswordDialog = function () {
    const { close } = ui.dialog('Change password', App.passwordForm({ forced: false, onDone: () => { ui.closeModal(); ui.toast('Password changed'); } }), null);
    return close;
  };

  /* ======================= ACCOUNTS (admin) ======================= */
  const when = (iso) => (iso ? ui.fmtDate(iso.slice(0, 10)) : '');
  const act = (fn, msg) => async () => { try { await fn(); if (msg) ui.toast(msg); App.render(); } catch (e) { fail(e); } };

  function editAccount(a) {
    ui.form({
      title: 'Edit account', values: { name: a.name, username: a.username, group: a.group },
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'username', label: 'Username', required: true, help: 'Letters, numbers, dots, dashes, underscores.' },
        { name: 'group', label: 'Group', type: 'select', options: [{ value: '', label: 'No group' }, ...store.groups()], help: 'Students can update tasks assigned to their group.', full: true }
      ],
      onSubmit(o) {
        let done; try { done = Promise.resolve(auth.update(a.id, o)); } catch (e) { return e.message; } // browser-only mode throws at once, the shared database answers later
        done.then(() => { ui.toast('Saved'); App.render(); }).catch(fail);
      }
    });
  }
  function addAccount() {
    ui.form({
      title: 'Add account', submitLabel: 'Create account', values: { name: '', username: '', role: 'student', group: '' },
      fields: [
        { name: 'name', label: 'Name', required: true },
        { name: 'username', label: 'Username', required: true, placeholder: 'first.last' },
        { name: 'role', label: 'Role', type: 'select', options: Object.keys(auth.ROLES).filter((r) => r !== 'admin').map((r) => ({ value: r, label: auth.ROLES[r].label })) },
        { name: 'group', label: 'Group', type: 'select', options: [{ value: '', label: 'No group' }, ...store.groups()] }
      ],
      onSubmit(o) {
        auth.createAccount(o).then((pw) => { App.render(); App.showCredentials('New account', [{ name: o.name, username: o.username.toLowerCase(), password: pw }]); }).catch(fail);
      }
    });
  }

  views.accounts = function (root) {
    if (!auth.isAdmin()) { root.append(h('div', { class: 'card empty' }, 'Only an admin can manage accounts.')); return; }
    const list = store.state.accounts.slice().sort((a, b) => auth.ROLES[b.role].rank - auth.ROLES[a.role].rank || a.name.localeCompare(b.name, undefined, { numeric: true }));
    const pending = list.filter((a) => a.status === 'pending');
    const rest = list.filter((a) => a.status !== 'pending');
    const students = list.filter((a) => a.role === 'student' && a.status === 'approved').length;
    const groupSelect = (value, onChange) => h('select', { class: 'inline-select', 'aria-label': 'Group', onchange: (e) => onChange(e.target.value) },
      [h('option', { value: '' }, 'No group'), ...store.groups().map((g) => h('option', { value: g, selected: g === value }, g))]);
    // Pending requests can only be approved as non-admins; an existing account can be made an admin from the table below.
    const roleOptions = (sel, onChange, withAdmin) => h('select', { class: 'inline-select', 'aria-label': 'Role', onchange: (e) => onChange(e.target.value) },
      Object.keys(auth.ROLES).filter((r) => withAdmin || r !== 'admin').map((r) => h('option', { value: r, selected: r === sel }, auth.ROLES[r].label)));
    const me = auth.current();
    // Making someone an admin, or removing admin powers, asks first. The menu is redrawn so it snaps back if you cancel.
    const changeRole = (a, role) => {
      const ask = role === 'admin' ? `Make ${a.name} an admin? Admins can approve accounts, reset passwords, change settings and make other admins.`
        : a.role === 'admin' ? `Remove admin powers from ${a.name}?` : null;
      if (!ask) return act(() => auth.setRole(a.id, role), 'Role updated')();
      ui.confirm(ask, role === 'admin' ? 'Make admin' : 'Remove admin', act(() => auth.setRole(a.id, role), role === 'admin' ? `${a.name} is now an admin` : 'Role updated'));
      App.render();
    };

    const pendingCard = pending.length > 0 && h('section', { class: 'card', style: { marginBottom: '16px', borderColor: 'var(--warn)' } },
      h('div', { class: 'card-head' }, h('h2', null, `Waiting for approval (${pending.length})`)),
      h('div', { class: 'table-wrap' }, h('table', { class: 'tbl' }, h('tbody', null, pending.map((a) => {
        let role = 'student', group = '';
        return h('tr', { style: { cursor: 'default' } },
          h('td', null, h('strong', null, a.name), h('div', { class: 'muted' }, `${a.username}, asked ${when(a.created)}`)),
          h('td', null, roleOptions('student', (v) => { role = v; })), h('td', null, groupSelect('', (v) => { group = v; })),
          h('td', { class: 'row-actions' },
            h('button', { class: 'btn btn-primary btn-small', type: 'button', onclick: act(() => auth.approve(a.id, role, group), `${a.name} approved`) }, 'Approve'),
            h('button', { class: 'btn btn-danger btn-small', type: 'button', onclick: () => ui.confirm(`Reject ${a.name}'s request?`, 'Reject', act(() => auth.remove(a.id), 'Request rejected')) }, 'Reject')));
      })))));

    const tbl = h('div', { class: 'card table-wrap' }, h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, ['Name', 'Username', 'Role', 'Group', 'Status', ''].map((t) => h('th', null, t)))),
      h('tbody', null, rest.map((a) => {
        const self = !!me && a.id === me.id; // your own row: no demoting, turning off or deleting yourself
        return h('tr', { style: { cursor: 'default' } },
          h('td', { class: 'title' }, a.name, self && h('span', { class: 'muted' }, '  (you)')), h('td', null, h('code', null, a.username)),
          h('td', null, self ? h('span', { class: 'badge s-done' }, auth.ROLES[a.role].label) : roleOptions(a.role, (v) => changeRole(a, v), true)),
          h('td', null, a.group || h('span', { class: 'muted' }, 'None')),
          h('td', null, ui.badge(a.status === 'approved' ? (a.mustChange ? 'Needs new password' : 'Active') : 'Turned off')),
          h('td', { class: 'row-actions' },
            h('button', { class: 'btn btn-small', type: 'button', onclick: () => editAccount(a) }, 'Edit'),
            !self && h('button', { class: 'btn btn-small', type: 'button', onclick: () => ui.confirm(`Give ${a.name} a new temporary password? The old one stops working.`, 'Reset', async () => { try { const pw = await auth.resetPassword(a.id); App.showCredentials('New temporary password', [{ name: a.name, username: a.username, password: pw }]); App.render(); } catch (e) { fail(e); } }) }, 'Reset password'),
            !self && h('button', { class: 'btn btn-small', type: 'button', onclick: act(() => auth.setStatus(a.id, a.status === 'approved' ? 'disabled' : 'approved')) }, a.status === 'approved' ? 'Turn off' : 'Turn on'),
            !self && h('button', { class: 'btn btn-danger btn-small', type: 'button', 'aria-label': `Delete ${a.name}`, onclick: () => ui.confirm(`Delete the account for ${a.name}?`, 'Delete', act(() => auth.remove(a.id), 'Account deleted')) }, ui.icon('trash'))));
      }))));

    root.append(
      App.pageHead('Accounts', `${list.length} accounts, ${students} students`, h('button', { class: 'btn btn-primary', type: 'button', onclick: addAccount }, [ui.icon('plus'), 'Add account'])),
      h('div', { class: 'card', style: { marginBottom: '16px', padding: '12px 16px', borderColor: 'var(--warn)' } },
        App.cloud && App.cloud.enabled
          ? [h('strong', null, 'Shared accounts: '), 'everyone signs in against the team database, and its rules enforce the roles. A password reset gives that person a new temporary password to hand over, and they choose their own the next time they sign in.']
          : [h('strong', null, 'Read this: '), 'accounts are stored in this browser only, because the site has no server. Other devices do not see them, and anyone who can open this browser\'s developer tools can read or change the data. Use it to keep the interface tidy, not for secrets. Export a backup from Settings to move everything to another device.']),
      pendingCard || '',
      h('h2', { style: { fontSize: '16px', margin: '8px 0' } }, 'Roles'),
      h('div', { class: 'grid grid-4', style: { marginBottom: '18px' } }, Object.keys(auth.ROLES).map((r) => h('div', { class: 'card stat' }, h('strong', null, auth.ROLES[r].label), h('div', { class: 'lbl' }, auth.ROLES[r].blurb)))),
      h('h2', { style: { fontSize: '16px', margin: '8px 0' } }, 'All accounts'), tbl);
  };

  /* ======================= SETTINGS (admin) ======================= */
  views.settings = function (root) {
    if (!auth.isAdmin()) { root.append(h('div', { class: 'card empty' }, 'Only an admin can open Settings.')); return; }
    const st = store.state.settings;
    const name = h('input', { value: st.teamName, maxlength: 60, id: 's-name' });
    const num = h('input', { value: st.teamNumber, maxlength: 20, id: 's-num' });
    const groups = h('textarea', { rows: 6, id: 's-groups' }); groups.value = st.groups.join('\n');
    const file = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, onchange: (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      const shared = !!(App.cloud && App.cloud.enabled);
      r.onload = () => ui.confirm(shared
        ? 'Replace the shared schedule (tasks, events, parts, news and settings) for everyone with the contents of ' + f.name + '? Accounts are not changed.'
        : 'Replace everything on this device with the contents of ' + f.name + '? Accounts in the file replace the current ones.', 'Replace', () => {
        try { store.replaceAll(JSON.parse(r.result)); if (shared) { App.render(); ui.toast('Imported'); } else { auth.logout(); location.reload(); } } catch (err) { fail(err); }
      });
      r.readAsText(f); e.target.value = '';
    } });
    const card = (title, ...body) => h('section', { class: 'card', style: { marginBottom: '16px' } }, h('div', { class: 'card-head' }, h('h2', null, title)), h('div', { class: 'card-body' }, body));
    const row = (...b) => h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } }, b);
    const b = (label, icon, fn, cls) => h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: fn }, icon && ui.icon(icon), label);

    root.append(
      App.pageHead('Settings'),
      card('Team',
        h('div', { class: 'modal-body', style: { padding: 0 } },
          h('div', { class: 'field' }, h('label', { for: 's-name' }, 'Team name'), name), h('div', { class: 'field' }, h('label', { for: 's-num' }, 'Team number'), num),
          h('div', { class: 'field full' }, h('label', { for: 's-groups' }, 'Groups (one per line)'), groups, h('span', { class: 'help' }, 'Used to assign work, and as the group on each account.'))),
        row(b('Save', null, () => {
          const g = groups.value.split('\n').map((s) => s.trim()).filter(Boolean);
          if (!g.length) return ui.toast('Keep at least one group.');
          store.saveSettings({ teamName: name.value.trim() || 'Alphabots', teamNumber: num.value.trim(), groups: g });
          App.render(); ui.toast('Saved');
        }, 'btn-primary'))),
      card('Backup and moving devices',
        h('p', { style: { marginTop: 0 } }, App.cloud && App.cloud.enabled
          ? 'The schedule is saved in the team database. A backup file is a safety copy of the tasks, events, parts, news and settings. Download one now and then.'
          : 'Everything is saved in this browser. Download a backup regularly, and use it to open the same schedule on another device.'),
        row(b('Export backup (JSON)', 'download', () => ui.download(`alphabots-backup-${App.date.today()}.json`, store.exportJson(), 'application/json'), 'btn-primary'),
          b('Import backup', 'upload', () => file.click()), b('Download calendar (.ics)', 'download', () => App.exportIcs()), file)),
      card('Example items',
        h('p', { style: { marginTop: 0 } }, 'The starter events, tasks, parts, people and the welcome post are marked as examples.'),
        row(b('Remove example items', 'trash', () => ui.confirm('Remove all example items? Your own items stay.', 'Remove', () => { store.removeExamples(); App.render(); ui.toast('Examples removed'); }), 'btn-danger'),
          b('Reload examples', null, () => ui.confirm('Replace all schedule content with fresh examples? Accounts stay.', 'Replace', () => { store.reset(); App.render(); ui.toast('Examples loaded'); })),
          b('Clear all content', 'trash', () => ui.confirm('Delete every event, task, part, person and post? Accounts stay.', 'Clear everything', () => { store.clearAll(); App.render(); ui.toast('Cleared'); }), 'btn-danger'))));
  };
})();
