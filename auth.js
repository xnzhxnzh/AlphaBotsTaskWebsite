/* Accounts and roles.
   IMPORTANT: this site has no server, so accounts live in this browser's storage. The role rules decide what the
   interface lets someone do, but anyone who can open this browser's developer tools can read or change the data.
   Treat it as a convenience gate, not as security. Passwords are never stored in plain text (salted PBKDF2). */
(function () {
  'use strict';
  const App = window.App, store = App.store;
  const auth = (App.auth = {});

  auth.ROLES = {
    admin: { label: 'Admin', rank: 4, blurb: 'Everything, including approving accounts and settings. There is exactly one.' },
    mentor: { label: 'Mentor', rank: 3, blurb: 'Create, edit and delete events, tasks, parts and news.' },
    lead: { label: 'Team lead', rank: 2, blurb: 'Create and edit events, tasks, parts and their own news posts. Cannot delete.' },
    student: { label: 'Student', rank: 1, blurb: 'View everything. Update the status of tasks assigned to them or their group.' }
  };
  const SESSION_KEY = 'alphabots-session';
  const enc = new TextEncoder();
  const ITER = 150000;

  /* ---------- hashing ---------- */
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function derive(password, saltB64, iter) {
    if (!(window.crypto && crypto.subtle)) throw new Error('This browser cannot hash passwords. Open the site over https:// or from localhost.');
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(saltB64), iterations: iter }, key, 256));
  }
  async function makeCreds(password) {
    const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    return { salt, iter: ITER, hash: await derive(password, salt, ITER) };
  }
  const sameString = (a, b) => { let d = a.length ^ b.length; for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0); return d === 0; };
  auth.tempPassword = function () {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    return Array.from(crypto.getRandomValues(new Uint8Array(10)), (n) => chars[n % chars.length]).join('');
  };

  /* ---------- lookups and session ---------- */
  const accounts = () => store.state.accounts;
  const byName = (u) => accounts().find((a) => a.username === String(u || '').trim().toLowerCase());
  auth.hasAdmin = () => accounts().some((a) => a.role === 'admin');
  auth.current = function () {
    let id = null;
    try { id = sessionStorage.getItem(SESSION_KEY); } catch (e) { /* storage blocked */ }
    const a = id && accounts().find((x) => x.id === id);
    return a && a.status === 'approved' ? a : null;
  };
  auth.logout = function () { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ } };
  const startSession = (a) => { try { sessionStorage.setItem(SESSION_KEY, a.id); } catch (e) { /* ignore */ } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let failures = 0;

  const validUsername = (u) => /^[a-z0-9._-]{3,30}$/.test(u);
  const checkNew = (username, password) => {
    if (!validUsername(username)) return 'Usernames are 3 to 30 letters, numbers, dots, dashes or underscores.';
    if (byName(username)) return 'That username is taken.';
    if (password != null && password.length < 8) return 'Use a password of at least 8 characters.';
    return '';
  };
  const stamp = () => new Date().toISOString();

  /* ---------- sign in / sign up ---------- */
  auth.login = async function (username, password) {
    if (failures) await sleep(Math.min(failures, 6) * 600); // slows repeated guessing
    const a = byName(username);
    let ok = false;
    try { ok = !!a && a.hash && sameString(await derive(password, a.salt, a.iter), a.hash); } catch (e) { return { error: e.message }; }
    if (!ok) { failures++; return { error: 'Wrong username or password.' }; }
    failures = 0;
    if (a.status === 'pending') return { error: 'Your request is waiting for the admin to approve it.' };
    if (a.status === 'disabled') return { error: 'This account is turned off. Ask the admin.' };
    startSession(a);
    return { account: a };
  };

  auth.requestAccess = async function ({ name, username, password }) {
    username = String(username || '').trim().toLowerCase();
    if (!String(name || '').trim()) return { error: 'Enter your name.' };
    const err = checkNew(username, password);
    if (err) return { error: err };
    const creds = await makeCreds(password);
    // Sign-ups are always students waiting for approval. Only the admin can approve or promote.
    store.state.accounts.push({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), username, name: String(name).trim().slice(0, 80), role: 'student', status: 'pending', group: '', ...creds, mustChange: false, created: stamp() });
    store.persist();
    return {};
  };

  /* First run: create the one admin, plus 15 student accounts with temporary passwords. */
  auth.setupAdmin = async function ({ name, username, password }) {
    if (auth.hasAdmin()) return { error: 'An admin already exists.' };
    username = String(username || '').trim().toLowerCase();
    if (!String(name || '').trim()) return { error: 'Enter your name.' };
    const err = checkNew(username, password);
    if (err) return { error: err };
    const list = store.state.accounts;
    const adminId = 'a' + Date.now().toString(36);
    list.push({ id: adminId, username, name: String(name).trim().slice(0, 80), role: 'admin', status: 'approved', group: 'Mentors & Coaches', ...(await makeCreds(password)), mustChange: false, created: stamp() });
    const students = [];
    for (let i = 1; i <= 15; i++) {
      const n = String(i).padStart(2, '0');
      const temp = auth.tempPassword();
      list.push({ id: 'a' + Date.now().toString(36) + n, username: 'student' + n, name: 'Student ' + n, role: 'student', status: 'approved', group: '', ...(await makeCreds(temp)), mustChange: true, created: stamp() });
      students.push({ name: 'Student ' + n, username: 'student' + n, password: temp });
    }
    startSession(list[0]);
    store.persist();
    return { students };
  };

  /* ---------- admin actions (every one re-checks that the caller is the admin) ---------- */
  const needAdmin = () => { const u = auth.current(); if (!u || u.role !== 'admin') throw new Error('Only the admin can do that.'); return u; };
  const save = () => store.persist();
  const target = (id) => { const a = accounts().find((x) => x.id === id); if (!a) throw new Error('Account not found.'); return a; };

  auth.approve = function (id, role, group) {
    needAdmin(); const a = target(id);
    if (role === 'admin') throw new Error('There can only be one admin.');
    a.status = 'approved'; a.role = auth.ROLES[role] ? role : 'student'; if (group != null) a.group = group; save();
  };
  auth.setRole = function (id, role) {
    needAdmin(); const a = target(id);
    if (a.role === 'admin') throw new Error('The admin account cannot change role.');
    if (role === 'admin' || !auth.ROLES[role]) throw new Error('There can only be one admin.');
    a.role = role; save();
  };
  auth.setStatus = function (id, status) {
    needAdmin(); const a = target(id);
    if (a.role === 'admin') throw new Error('The admin account cannot be turned off.');
    a.status = status; save();
  };
  auth.update = function (id, { name, username, group }) {
    needAdmin(); const a = target(id);
    username = String(username || '').trim().toLowerCase();
    if (username !== a.username) { if (!validUsername(username)) throw new Error('Usernames are 3 to 30 letters, numbers, dots, dashes or underscores.'); if (byName(username)) throw new Error('That username is taken.'); a.username = username; }
    a.name = String(name || '').trim().slice(0, 80) || a.username; a.group = group || ''; save();
  };
  auth.resetPassword = async function (id) {
    needAdmin(); const a = target(id); const temp = auth.tempPassword();
    Object.assign(a, await makeCreds(temp), { mustChange: true }); save(); return temp;
  };
  auth.createAccount = async function ({ name, username, role, group }) {
    needAdmin(); username = String(username || '').trim().toLowerCase();
    const err = checkNew(username, null); if (err) throw new Error(err);
    if (role === 'admin') throw new Error('There can only be one admin.');
    const temp = auth.tempPassword();
    accounts().push({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), username, name: String(name || '').trim().slice(0, 80) || username, role: auth.ROLES[role] ? role : 'student', status: 'approved', group: group || '', ...(await makeCreds(temp)), mustChange: true, created: stamp() });
    save(); return temp;
  };
  auth.remove = function (id) {
    needAdmin(); const a = target(id);
    if (a.role === 'admin') throw new Error('The admin account cannot be deleted.');
    store.state.accounts = accounts().filter((x) => x.id !== id); save();
  };

  /* Any signed-in user can change their own password. */
  auth.changePassword = async function (current, next) {
    const u = auth.current(); if (!u) return { error: 'Sign in first.' };
    if (!u.mustChange && !sameString(await derive(current, u.salt, u.iter), u.hash)) return { error: 'The current password is wrong.' };
    if (next.length < 8) return { error: 'Use a password of at least 8 characters.' };
    Object.assign(u, await makeCreds(next), { mustChange: false }); save(); return {};
  };

  /* ---------- what each role may do ---------- */
  const isMine = (names, u) => names.some((n) => n === u.name || (u.group && n === u.group)); // primary or sub-person, by name or group
  const CONTENT = ['event', 'task', 'milestone', 'part', 'news', 'person'];
  // Returns 'full' (edit + delete), 'edit', 'status' (status/progress only) or 'view'.
  auth.level = function (type, item) {
    const u = auth.current(); if (!u) return 'view';
    if (type === 'milestone') type = 'task';
    if (u.role === 'admin' || u.role === 'mentor') return 'full';
    if (u.role === 'lead') {
      if (type === 'person') return 'view';
      if (type === 'news') return !item || item.author === u.name ? 'edit' : 'view';
      return 'edit';
    }
    if (type === 'task' && item && !item.milestone && isMine(App.taskPeople(item).all, u)) return 'status';
    return 'view';
  };
  auth.canCreate = function (type) { const u = auth.current(); return !!u && (u.role === 'admin' || u.role === 'mentor' || (u.role === 'lead' && type !== 'person')) && CONTENT.includes(type); };
  auth.isAdmin = () => { const u = auth.current(); return !!u && u.role === 'admin'; };
  auth.canExport = () => !!auth.current();
})();
