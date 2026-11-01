/* Small UI toolkit: element builder, icons, formatting, toasts, modal forms. No innerHTML with user data. */
(function () {
  'use strict';
  const App = window.App;
  const ui = (App.ui = {});

  /* h('div', {class:'x', onclick: fn}, 'text', childNode, [more]) */
  ui.h = function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'value' || k === 'checked' || k === 'selected' || k === 'disabled' || k === 'textContent') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    const add = (kid) => {
      if (kid == null || kid === false) return;
      if (Array.isArray(kid)) kid.forEach(add);
      else el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    };
    kids.forEach(add);
    return el;
  };
  const h = ui.h;

  /* ---------- icons (Feather-style paths) ---------- */
  const ICONS = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
    timeline: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
    tasks: '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    cart: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    news: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    left: '<polyline points="15 18 9 12 15 6"/>',
    right: '<polyline points="9 18 15 12 9 6"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    print: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'
  };
  ui.icon = function (name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'icon');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || ''; // constant markup only
    return s;
  };
  ui.mountIcons = function (root) {
    root.querySelectorAll('[data-icon]').forEach((n) => { n.replaceChildren(ui.icon(n.dataset.icon)); });
  };

  /* ---------- formatting ---------- */
  const D = App.date;
  ui.fmtDate = (s, opts) => (s ? D.parse(s).toLocaleDateString(undefined, opts || { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  ui.fmtShort = (s) => ui.fmtDate(s, { month: 'short', day: 'numeric' });
  ui.fmtRange = (a, b) => (!b || a === b ? ui.fmtShort(a) : `${ui.fmtShort(a)} to ${ui.fmtShort(b)}`);
  ui.fmtTime = (t) => {
    if (!t) return '';
    const [hh, mm] = t.split(':').map(Number);
    return `${((hh + 11) % 12) + 1}:${D.pad(mm)} ${hh < 12 ? 'am' : 'pm'}`;
  };
  ui.relDay = (s) => {
    const n = D.diffDays(D.today(), s);
    if (n === 0) return 'Today';
    if (n === 1) return 'Tomorrow';
    if (n === -1) return 'Yesterday';
    if (n > 1 && n < 7) return D.parse(s).toLocaleDateString(undefined, { weekday: 'long' });
    return ui.fmtShort(s);
  };
  ui.money = (n) => '$' + (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  ui.slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  ui.badge = (status) => h('span', { class: 'badge s-' + ui.slug(status) }, status);
  ui.initials = (name) => (name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
  ui.contains = (obj, q) => {
    if (!q) return true;
    const needle = q.toLowerCase();
    const hit = (s) => typeof s === 'string' && s.toLowerCase().includes(needle);
    return Object.values(obj).some((v) => (Array.isArray(v) ? v.some(hit) : hit(v)));
  };

  /* ---------- toasts ---------- */
  ui.toast = function (msg) {
    const t = h('div', { class: 'toast' }, msg);
    document.getElementById('toasts').append(t);
    setTimeout(() => t.remove(), 3500);
  };

  /* ---------- downloads ---------- */
  ui.download = function (filename, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type: type || 'text/plain' }));
    const a = h('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /* ---------- modal ---------- */
  let closeCurrent = null;
  ui.closeModal = function () { if (closeCurrent) closeCurrent(); };

  function openModal(title, bodyNodes, footNodes) {
    ui.closeModal();
    const previous = document.activeElement;
    const back = h('div', { class: 'modal-back' });
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); closeCurrent = null; if (previous && previous.focus) previous.focus(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'modal-head' }, h('h2', null, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, ui.icon('x'))),
      bodyNodes, footNodes);
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    back.append(modal);
    document.getElementById('modal-root').append(back);
    document.addEventListener('keydown', onKey);
    closeCurrent = close;
    return { close, modal };
  }

  ui.dialog = openModal; // (title, bodyNode, footNode) -> {close, modal}

  ui.confirm = function (message, okLabel, onOk) {
    const { close } = openModal('Please confirm',
      h('div', { class: 'modal-body', style: { gridTemplateColumns: '1fr' } }, h('p', { style: { margin: 0 } }, message)),
      h('div', { class: 'modal-foot' },
        h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { close(); onOk(); } }, okLabel || 'Delete'),
        h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Cancel')));
  };

  /* fields: [{name,label,type:'text|textarea|date|time|number|select|checkbox|url',options,required,full,help,placeholder,min,max}]
     onSubmit(values) returns an error string to keep the form open, or nothing to close it. */
  ui.form = function ({ title, fields, values, submitLabel, onSubmit, onDelete, readOnly, editable }) {
    const inputs = {};
    const customs = {};
    const errBox = h('div', { class: 'form-error', hidden: true });
    const body = h('div', { class: 'modal-body' });
    for (const f of fields) {
      let input;
      const v = values[f.name];
      if (f.type === 'custom') { // a widget supplied by the caller: {node, get(), setDisabled(bool)}
        const built = f.build(v);
        built.setDisabled(!!(readOnly || (editable && !editable.includes(f.name))));
        customs[f.name] = built;
        body.append(h('div', { class: 'field full' }, h('label', null, f.label), built.node, f.help && h('span', { class: 'help' }, f.help)));
        continue;
      }
      const common = { id: 'f-' + f.name, name: f.name };
      if (f.type === 'textarea') input = h('textarea', { ...common, rows: 4, value: v == null ? '' : v, placeholder: f.placeholder });
      else if (f.type === 'select') {
        input = h('select', common, f.options.map((o) => {
          const val = typeof o === 'string' ? o : o.value, lab = typeof o === 'string' ? o : o.label;
          return h('option', { value: val }, lab || '(none)');
        }));
        input.value = v == null ? '' : v;
        if (input.value !== (v == null ? '' : v) && f.options.length) input.selectedIndex = 0;
      } else if (f.type === 'checkbox') input = h('input', { ...common, type: 'checkbox', checked: !!v });
      else input = h('input', { ...common, type: f.type || 'text', value: v == null ? '' : v, placeholder: f.placeholder, min: f.min, max: f.max, step: f.step, maxlength: f.type === 'text' || !f.type ? 140 : null });
      if (readOnly || (editable && !editable.includes(f.name))) input.disabled = true;
      inputs[f.name] = input;
      const label = h('label', { for: 'f-' + f.name }, f.label + (f.required ? ' *' : ''));
      body.append(f.type === 'checkbox'
        ? h('div', { class: 'field check full' }, input, label, f.help && h('span', { class: 'help' }, f.help))
        : h('div', { class: 'field' + (f.full ? ' full' : '') }, label, input, f.help && h('span', { class: 'help' }, f.help)));
    }
    body.append(errBox);

    const collect = () => {
      const out = {};
      for (const f of fields) {
        if (customs[f.name]) { out[f.name] = customs[f.name].get(); continue; }
        const el = inputs[f.name];
        out[f.name] = f.type === 'checkbox' ? el.checked : f.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim();
      }
      return out;
    };
    const submit = (e) => {
      e.preventDefault();
      const out = collect();
      for (const f of fields) {
        if (f.required && (out[f.name] === '' || out[f.name] == null)) {
          errBox.textContent = `${f.label} is required.`; errBox.hidden = false; inputs[f.name].focus(); return;
        }
      }
      const err = onSubmit(out);
      if (err) { errBox.textContent = err; errBox.hidden = false; return; }
      close();
    };
    const foot = h('div', { class: 'modal-foot' },
      !readOnly && h('button', { class: 'btn btn-primary', type: 'submit' }, submitLabel || 'Save'),
      h('button', { class: 'btn', type: 'button', onclick: () => close() }, readOnly ? 'Close' : 'Cancel'),
      readOnly && h('span', { class: 'help muted' }, 'You can view this but not change it.'),
      h('span', { class: 'spacer' }),
      onDelete && h('button', { class: 'btn btn-danger', type: 'button', onclick: () => ui.confirm('Delete this item? This cannot be undone.', 'Delete', () => { close(); onDelete(); }) }, [ui.icon('trash'), 'Delete']));
    const wrap = h('form', { novalidate: true, onsubmit: submit }, body, foot);
    const { close } = openModal(title, wrap, null);
    const first = fields.find((f) => f.type !== 'checkbox' && f.type !== 'custom' && !inputs[f.name].disabled);
    if (first) inputs[first.name].focus();
  };
})();
