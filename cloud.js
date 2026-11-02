/* Shared database: Firebase Authentication + Cloud Firestore.
   Only active when firebase-config.js contains your project's settings. Without them the site keeps working
   on its own in each browser (see store.js and auth.js).

   Who may do what is enforced by firestore.rules on Google's servers. The checks in this file only make the
   page friendlier; they are not the security. */
(function () {
  'use strict';
  const App = window.App;
  const cfg = window.FIREBASE_CONFIG;
  const cloud = (App.cloud = { enabled: false, booting: false, adminExists: null, error: '' });
  if (!(cfg && cfg.apiKey)) return;

  cloud.enabled = true;
  if (typeof firebase === 'undefined') {
    cloud.error = 'Could not load Firebase. Check your internet connection and reload the page.';
    return;
  }

  const store = App.store, auth = App.auth;
  // Firebase can answer before the last script (app.js) has loaded; the page draws itself once everything is ready.
  const redraw = () => { if (typeof App.render === 'function') App.render(); };
  const fauth = (firebase.initializeApp(cfg), firebase.auth());
  const db = firebase.firestore();
  const CONTENT = ['tasks', 'events', 'parts', 'news'];
  const BATCH = 5; // small batches keep each write well inside Firestore's per-request rule-lookup limit
  const EMAIL_DOMAIN = 'alphabots-schedule.example'; // students never type this; usernames map to it

  let profile = null;      // the signed-in account (always approved)
  let unsubs = [];         // live listeners
  let busyFlow = 0;        // >0 while sign-up flows run, so the auth listener does not interfere
  let loginWaiter = null;  // lets login() wait for the profile and data to load
  let failures = 0;
  cloud.booting = true;

  /* ---------- small helpers ---------- */
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const norm = (u) => String(u || '').trim().toLowerCase();
  const validUsername = (u) => /^[a-z0-9._-]{3,30}$/.test(u);
  const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (n) => (n % 36).toString(36)).join('');
  const makeEmail = (u) => `${u}.${rand()}@${EMAIL_DOMAIN}`;
  const now = () => new Date().toISOString();
  const clean = (o) => { const { id, ...rest } = o; return JSON.parse(JSON.stringify(rest)); }; // Firestore rejects undefined
  const users = () => db.collection('users');
  const usernames = () => db.collection('usernames');
  const metaDoc = (name) => db.collection('meta').doc(name);

  function friendly(e) {
    const c = (e && e.code) || '';
    if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-login-credentials'].includes(c)) return 'Wrong username or password.';
    if (c === 'auth/too-many-requests') return 'Too many tries. Wait a few minutes and try again.';
    if (c === 'auth/network-request-failed') return 'No internet connection.';
    if (c === 'auth/operation-not-allowed') return 'Email/password sign-in is not turned on in Firebase (Authentication > Sign-in method).';
    if (c === 'auth/email-already-in-use') return 'That username is taken.';
    if (c === 'auth/weak-password') return 'Use a stronger password.';
    if (c === 'permission-denied') return 'Not allowed. The Firestore rules may not be published yet, or your role cannot do that.';
    if (c === 'unavailable') return 'Cannot reach the database. Check your internet connection.';
    return (e && e.message) || String(e);
  }
  const toast = (m) => App.ui && App.ui.toast(m);
  function write(promise) { promise.catch((e) => { console.error(e); toast('Not saved: ' + friendly(e)); }); return promise; }

  /* ---------- writes from the rest of the app go here ---------- */
  async function commitOps(ops) {
    for (let i = 0; i < ops.length; i += BATCH) {
      const b = db.batch();
      ops.slice(i, i + BATCH).forEach((op) => op(b));
      await b.commit();
    }
  }
  store.setSink({
    upsert(coll, obj) {
      const ref = db.collection(coll).doc(obj.id);
      // A student may only change status and progress of their own tasks, so send exactly those two fields.
      if (profile && profile.role === 'student' && coll === 'tasks') return write(ref.update({ status: obj.status, progress: obj.progress }));
      return write(ref.set(clean(obj)));
    },
    remove: (coll, id) => write(db.collection(coll).doc(id).delete()),
    settings(s) {
      if (profile && profile.role !== 'admin') return write(metaDoc('settings').update({ autoShift: s.autoShift })); // editors may only flip this one switch
      return write(metaDoc('settings').set(clean(s)));
    },
    replaceContent(prev, next) {
      const ops = [];
      for (const c of CONTENT) {
        const keep = new Set(next[c].map((o) => o.id));
        prev[c].filter((o) => !keep.has(o.id)).forEach((o) => ops.push((b) => b.delete(db.collection(c).doc(o.id))));
        next[c].forEach((o) => ops.push((b) => b.set(db.collection(c).doc(o.id), clean(o))));
      }
      write(commitOps(ops));
    }
  });

  /* ---------- live data ---------- */
  const mapUser = (d) => ({ id: d.id, ...d.data(), salt: '', hash: '', iter: 0 });

  function detach() { unsubs.forEach((u) => u()); unsubs = []; }
  function attachListeners() {
    detach();
    const firsts = [];
    const watch = (source, onSnap) => {
      firsts.push(new Promise((resolve) => {
        let first = true;
        const done = () => { if (first) { first = false; resolve(); } };
        unsubs.push(source.onSnapshot((snap) => { onSnap(snap); done(); }, (err) => { console.error(err); toast(friendly(err)); done(); }));
      }));
    };
    watch(users(), (snap) => {
      const list = snap.docs.map(mapUser);
      store.setAccounts(list);
      if (profile) {
        const me = list.find((a) => a.id === profile.id);
        if (!me || me.status !== 'approved') { toast('Your account was changed or turned off.'); auth.logout(); redraw(); }
        else profile = me;
      }
    });
    watch(metaDoc('settings'), (snap) => store.setSettings(snap.exists ? snap.data() : null));
    CONTENT.forEach((c) => watch(db.collection(c), (snap) => store.applyRemote(c, snap.docs.map((d) => ({ id: d.id, ...d.data() })))));
    return Promise.all(firsts);
  }

  async function refreshAdminExists() {
    try { cloud.adminExists = (await metaDoc('admin').get()).exists; cloud.error = ''; }
    catch (e) { cloud.error = friendly(e); }
    return cloud.adminExists;
  }
  cloud.refreshAdminExists = refreshAdminExists;

  async function loadSession(user) {
    // Remember why we are signing out, so the sign-out event that follows does not hide the real reason.
    const bail = async (msg) => { cloud.lastError = msg; try { await fauth.signOut(); } catch (e) { /* already out */ } return { error: msg }; };
    let snap;
    try { snap = await users().doc(user.uid).get(); } catch (e) { return bail(friendly(e)); }
    if (!snap.exists) return bail('This login has no account profile. Ask the admin.');
    const d = snap.data();
    if (d.status === 'pending') return bail('Your request is waiting for the admin to approve it.');
    if (d.status === 'disabled') return bail('This account is turned off. Ask the admin.');
    profile = { id: user.uid, ...d, salt: '', hash: '', iter: 0 };
    await attachListeners();
    return { ok: true };
  }

  fauth.onAuthStateChanged(async (user) => {
    if (busyFlow) return;
    let result;
    if (!user) {
      detach(); profile = null; store.resetBlank();
      await refreshAdminExists();
      result = { error: cloud.lastError || 'Signed out.' };
    } else { cloud.lastError = ''; result = await loadSession(user); }
    cloud.booting = false;
    if (loginWaiter) { loginWaiter(result); loginWaiter = null; cloud.lastError = ''; }
    redraw();
  });

  /* ---------- creating login accounts for other people (the admin stays signed in) ---------- */
  async function createAuthUser(email, password) {
    const second = firebase.apps.find((a) => a.name === 'creator') || firebase.initializeApp(cfg, 'creator');
    const a2 = second.auth();
    const cred = await a2.createUserWithEmailAndPassword(email, password);
    await a2.signOut();
    return cred.user.uid;
  }
  const userDoc = (o) => ({ username: o.username, name: o.name, role: o.role, status: o.status, group: o.group || '', mustChange: !!o.mustChange, email: o.email, created: o.created || now() });

  /* ---------- the same API as the browser-only auth.js, now backed by Firebase ---------- */
  const needAdmin = () => { if (!auth.isAdmin()) throw new Error('Only the admin can do that.'); };
  const target = (id) => { const a = store.state.accounts.find((x) => x.id === id); if (!a) throw new Error('Account not found.'); return a; };
  const checkName = (u) => (validUsername(u) ? '' : 'Usernames are 3 to 30 letters, numbers, dots, dashes or underscores.');

  Object.assign(auth, {
    current: () => profile,
    hasAdmin: () => !!cloud.adminExists,
    logout() { profile = null; detach(); store.resetBlank(); fauth.signOut().catch(() => {}); },

    async login(username, password) {
      if (failures) await sleep(Math.min(failures, 6) * 600);
      const name = norm(username);
      let email = null;
      try { const s = await usernames().doc(name).get(); email = s.exists ? s.data().email : null; } catch (e) { return { error: friendly(e) }; }
      if (!email) { failures++; return { error: 'Wrong username or password.' }; }
      const waiting = new Promise((resolve) => { loginWaiter = resolve; });
      try { await fauth.signInWithEmailAndPassword(email, password); } catch (e) { loginWaiter = null; failures++; return { error: friendly(e) }; }
      const r = await waiting;
      if (r.error) return { error: r.error };
      failures = 0;
      return { account: profile };
    },

    async requestAccess({ name, username, password }) {
      username = norm(username);
      if (!String(name || '').trim()) return { error: 'Enter your name.' };
      if (checkName(username)) return { error: checkName(username) };
      if (!password || password.length < 8) return { error: 'Use a password of at least 8 characters.' };
      busyFlow++;
      try {
        try { if ((await usernames().doc(username).get()).exists) return { error: 'That username is taken.' }; } catch (e) { return { error: friendly(e) }; }
        const email = makeEmail(username);
        let cred;
        try { cred = await fauth.createUserWithEmailAndPassword(email, password); } catch (e) { return { error: friendly(e) }; }
        try {
          const b = db.batch();
          b.set(users().doc(cred.user.uid), userDoc({ username, name: String(name).trim().slice(0, 80), role: 'student', status: 'pending', group: '', email }));
          b.set(usernames().doc(username), { uid: cred.user.uid, email });
          await b.commit();
        } catch (e) {
          try { await cred.user.delete(); } catch (x) { /* nothing to clean */ }
          return { error: e.code === 'permission-denied' ? 'That username is taken, or sign-ups are closed.' : friendly(e) };
        }
        await fauth.signOut();
        return {};
      } finally { busyFlow--; }
    },

    /* First run on a fresh database: the first person here becomes the one admin, and 15 student accounts are created. */
    async setupAdmin({ name, username, password }, onProgress) {
      username = norm(username);
      if (!String(name || '').trim()) return { error: 'Enter your name.' };
      if (checkName(username)) return { error: checkName(username) };
      if (!password || password.length < 8) return { error: 'Use a password of at least 8 characters.' };
      busyFlow++;
      try {
        if (await refreshAdminExists()) return { error: 'An admin already exists. Reload the page and sign in.' };
        if (cloud.error) return { error: cloud.error };
        const email = makeEmail(username);
        let cred;
        try { cred = await fauth.createUserWithEmailAndPassword(email, password); } catch (e) { return { error: friendly(e) }; }
        const uid = cred.user.uid;
        try { // one atomic write: the rules allow it only while no admin exists yet
          const b = db.batch();
          b.set(users().doc(uid), userDoc({ username, name: String(name).trim().slice(0, 80), role: 'admin', status: 'approved', group: 'Mentors & Coaches', email }));
          b.set(metaDoc('admin'), { uid, created: now() });
          b.set(usernames().doc(username), { uid, email });
          await b.commit();
        } catch (e) {
          try { await cred.user.delete(); } catch (x) { /* nothing to clean */ }
          return { error: e.code === 'permission-denied' ? 'Setup was refused. Someone may have created the admin first, or the Firestore rules are not published.' : friendly(e) };
        }
        cloud.adminExists = true;
        const session = await loadSession(cred.user);
        if (session.error) return session;

        await metaDoc('settings').set(clean(store.state.settings));
        const students = [], ops = [];
        for (let i = 1; i <= 15; i++) {
          const n = String(i).padStart(2, '0'), sname = 'student' + n, temp = auth.tempPassword(), semail = makeEmail(sname);
          if (onProgress) onProgress(i, 15);
          const suid = await createAuthUser(semail, temp);
          ops.push((b) => b.set(users().doc(suid), userDoc({ username: sname, name: 'Student ' + n, role: 'student', status: 'approved', group: '', mustChange: true, email: semail })));
          ops.push((b) => b.set(usernames().doc(sname), { uid: suid, email: semail }));
          students.push({ name: 'Student ' + n, username: sname, password: temp });
        }
        await commitOps(ops);
        store.reset(); // example events, tasks, parts and a welcome post
        return { students };
      } catch (e) {
        return { error: 'Setup stopped part-way: ' + friendly(e) + ' You are the admin now; add the student accounts under Accounts.' };
      } finally { busyFlow--; cloud.booting = false; }
    },

    async approve(id, role, group) {
      needAdmin(); const a = target(id);
      if (role === 'admin' || a.role === 'admin') throw new Error('There can only be one admin.');
      await users().doc(id).update({ status: 'approved', role: auth.ROLES[role] ? role : 'student', group: group || '' });
    },
    async setRole(id, role) {
      needAdmin(); const a = target(id);
      if (a.role === 'admin') throw new Error('The admin account cannot change role.');
      if (role === 'admin' || !auth.ROLES[role]) throw new Error('There can only be one admin.');
      await users().doc(id).update({ role });
    },
    async setStatus(id, status) {
      needAdmin(); const a = target(id);
      if (a.role === 'admin') throw new Error('The admin account cannot be turned off.');
      await users().doc(id).update({ status });
    },
    async update(id, { name, username, group }) {
      needAdmin(); const a = target(id);
      username = norm(username);
      const patch = { name: String(name || '').trim().slice(0, 80) || a.username, group: group || '' };
      if (username === a.username) { await users().doc(id).update(patch); return; }
      if (checkName(username)) throw new Error(checkName(username));
      if ((await usernames().doc(username).get()).exists) throw new Error('That username is taken.');
      const b = db.batch();
      b.update(users().doc(id), { ...patch, username });
      b.set(usernames().doc(username), { uid: id, email: a.email });
      b.delete(usernames().doc(a.username));
      await b.commit();
    },
    /* Firebase cannot set another person's password from a web page, so a reset makes a fresh login for the same
       username and retires the old one (the old login has no profile any more, so it cannot get in). */
    async resetPassword(id) {
      needAdmin(); const a = target(id);
      if (a.role === 'admin') throw new Error('Use "Change password" in your account menu for the admin account.');
      const temp = auth.tempPassword(), email = makeEmail(a.username);
      const uid2 = await createAuthUser(email, temp);
      const b = db.batch();
      b.set(users().doc(uid2), userDoc({ ...a, email, mustChange: true }));
      b.delete(users().doc(id));
      b.set(usernames().doc(a.username), { uid: uid2, email });
      await b.commit();
      return temp;
    },
    async createAccount({ name, username, role, group }) {
      needAdmin(); username = norm(username);
      if (checkName(username)) throw new Error(checkName(username));
      if (role === 'admin') throw new Error('There can only be one admin.');
      if ((await usernames().doc(username).get()).exists) throw new Error('That username is taken.');
      const temp = auth.tempPassword(), email = makeEmail(username);
      const uid = await createAuthUser(email, temp);
      const b = db.batch();
      b.set(users().doc(uid), userDoc({ username, name: String(name || '').trim().slice(0, 80) || username, role: auth.ROLES[role] ? role : 'student', status: 'approved', group: group || '', mustChange: true, email }));
      b.set(usernames().doc(username), { uid, email });
      await b.commit();
      return temp;
    },
    async remove(id) {
      needAdmin(); const a = target(id);
      if (a.role === 'admin') throw new Error('The admin account cannot be deleted.');
      const b = db.batch();
      b.delete(users().doc(id));
      b.delete(usernames().doc(a.username));
      await b.commit();
    },

    async changePassword(current, next) {
      const u = fauth.currentUser;
      if (!u || !profile) return { error: 'Sign in first.' };
      if (!next || next.length < 8) return { error: 'Use a password of at least 8 characters.' };
      try {
        if (!profile.mustChange) await u.reauthenticateWithCredential(firebase.auth.EmailAuthProvider.credential(u.email, current));
        await u.updatePassword(next);
        if (profile.mustChange) { await users().doc(u.uid).update({ mustChange: false }); profile.mustChange = false; }
      } catch (e) {
        return { error: ['auth/wrong-password', 'auth/invalid-credential'].includes(e.code) ? 'The current password is wrong.' : friendly(e) };
      }
      return {};
    }
  });
})();
