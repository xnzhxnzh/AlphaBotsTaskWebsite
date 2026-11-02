/* Task dependencies (finish-to-start): a task that "waits for" others must start after they finish.
   A task's `waitsFor` is a list of the ids of the tasks it depends on. */
(function () {
  'use strict';
  const App = window.App, D = App.date, store = App.store;
  const deps = (App.deps = {});

  const tasks = () => store.state.tasks;
  const byId = (id) => tasks().find((t) => t.id === id);

  deps.preds = (task) => (task.waitsFor || []).map(byId).filter(Boolean);
  deps.successors = (id) => tasks().filter((t) => (t.waitsFor || []).includes(id));

  // Predecessors that finish on or after this task's start day.
  deps.conflicts = (task) => deps.preds(task).filter((p) => task.start <= p.end);

  // Would making `taskId` wait for `predId` create a loop (A waits for B waits for A)?
  deps.wouldCycle = function (taskId, predId) {
    if (!taskId) return false; // a brand-new task has nothing waiting on it yet
    if (taskId === predId) return true;
    const seen = new Set();
    const stack = [predId];
    while (stack.length) {
      const id = stack.pop();
      if (id === taskId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const t = byId(id);
      if (t) stack.push(...(t.waitsFor || []));
    }
    return false;
  };

  // After `rootId` changed its dates, push every task that waits for it (and for those, and so on) later if needed.
  // Tasks only ever move later, and keep their length. Returns the tasks that moved.
  deps.cascade = function (rootId) {
    const moved = new Map();
    const queue = [rootId];
    let guard = tasks().length * tasks().length + 10; // loop protection for hand-edited data
    while (queue.length && guard-- > 0) {
      const cur = byId(queue.shift());
      if (!cur) continue;
      for (const s of deps.successors(cur.id)) {
        const need = D.addDays(cur.end, 1);
        if (s.start >= need) continue;
        const shift = D.diffDays(s.start, need);
        s.start = D.addDays(s.start, shift);
        s.end = s.milestone ? s.start : D.addDays(s.end, shift);
        moved.set(s.id, s);
        queue.push(s.id);
      }
    }
    for (const m of moved.values()) store.upsert('tasks', m); // saves each moved task (locally, or to the shared database)
    return [...moved.values()];
  };

  // Call after a task's dates changed. Honors the "shift dependent tasks automatically" setting.
  // Returns a short message for a toast, or ''.
  deps.afterEdit = function (taskId) {
    const t = byId(taskId);
    if (!t) return '';
    let msg = '';
    if (store.state.settings.autoShift !== false) {
      const moved = deps.cascade(taskId);
      if (moved.length) msg = `Moved ${moved.length} later task${moved.length === 1 ? '' : 's'} to keep the order.`;
    }
    const late = deps.conflicts(t);
    if (late.length) msg = (msg ? msg + ' ' : '') + `Heads up: it starts before "${late[0].title}" finishes.`;
    return msg;
  };

  // Push every out-of-order task later. Returns how many tasks moved.
  deps.fixAll = function () {
    const moved = new Set();
    for (const t of tasks().slice()) deps.cascade(t.id).forEach((m) => moved.add(m.id));
    return moved.size;
  };

  deps.conflictCount = () => tasks().filter((t) => deps.conflicts(t).length).length;
})();
