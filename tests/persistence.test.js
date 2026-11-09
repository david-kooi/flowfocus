const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Model = require('../Model.js');

// Exercise the actual QML JavaScript handlers, without starting a desktop or
// touching live state. This catches regressions in wiring as well as parsing.
function component(filename) {
  const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  let writes = 0;
  let settingsSyncs = 0;
  const root = {
    state: Model.defaultState(), loaded: false,
    syncSettingsFromShellJson() { settingsSyncs++; },
    applyTickState() {},
  };
  const context = vm.createContext({
    Model, root, FileViewError: { FileNotFound: 1 },
    stateFile: { setText() { writes++; } },
  });
  for (const name of ['adoptState', filename === 'BarWidget.qml' ? 'saveState' : 'ovSave']) {
    const match = source.match(new RegExp(`  function ${name}\\([^]*?\\n  }`));
    assert.ok(match, `Missing ${name}`);
    root[name] = vm.runInContext(`(${match[0].trim()})`, context);
  }
  assert.match(source, /onLoaded: root\.adoptState\(text\(\)\)/);
  assert.match(source, /onTextChanged: root\.adoptState\(text\(\)\)/);
  assert.doesNotMatch(source, /Model\.parse\(/);
  return { source, root, context, writes: () => writes, settingsSyncs: () => settingsSyncs };
}

for (const filename of ['BarWidget.qml', 'Overlay.qml']) {
  test(`${filename}: torn startup reads cannot enable saving empty defaults`, () => {
    const c = component(filename);
    const save = c.root.saveState || c.root.ovSave;
    for (const raw of ['', '{', '{}', '{"tasks":[]}']) {
      c.root.adoptState(raw);
      save();
      assert.equal(c.root.loaded, false);
      assert.equal(c.writes(), 0);
    }
  });

  test(`${filename}: reload preserves spaces/tasks and never echoes snapshots to disk`, () => {
    const c = component(filename);
    const state = Model.defaultState();
    Model.createKanbanProfile(state, 'Personal');
    Model.addTask(state, 'Keep this task', 'todo', state.activeKanbanProfileId);
    c.root.adoptState(Model.serialize(state));
    assert.equal(c.root.loaded, true);
    const good = Model.serialize(c.root.state);
    for (const raw of ['', '{broken', '{}']) {
      c.root.adoptState(raw);
      assert.equal(Model.serialize(c.root.state), good);
    }
    state.timer.status = 'running';
    state.timer.deadlineMs = Date.now() + 60000;
    c.root.adoptState(Model.serialize(state));
    c.root.adoptState(Model.serialize(state));
    assert.equal(c.root.state.timer.status, 'running');
    assert.equal(c.root.state.tasks.length, 1);
    assert.equal(c.root.state.kanbanProfiles.length, 2);
    assert.equal(c.writes(), 0);
    assert.equal(c.settingsSyncs(), filename === 'BarWidget.qml' ? 1 : 0);
  });
}

test('bar initializes only on first-use FileNotFound, never other load errors', () => {
  const c = component('BarWidget.qml');
  const handler = c.source.match(/onLoadFailed: (function\(error\) {[^]*?\n    })/);
  assert.ok(handler);
  const failed = vm.runInContext(`(${handler[1]})`, c.context);
  failed(2); // permission/read error
  assert.equal(c.root.loaded, false);
  assert.equal(c.writes(), 0);
  failed(1);
  assert.equal(c.root.loaded, true);
  assert.equal(c.writes(), 1);
  Model.addTask(c.root.state, 'Keep after missing-file event', 'todo', 'default');
  failed(1);
  assert.equal(c.root.state.tasks.length, 1);
  assert.equal(c.writes(), 1);
});

test('overlay open uses guarded adoption and requests a fresh read', () => {
  const c = component('Overlay.qml');
  const open = c.source.match(/  function open\(payload\) {[^]*?\n  }/)[0];
  assert.match(open, /root\.adoptState\(stateFile\.text\(\)\)/);
  assert.match(open, /stateFile\.reload\(\)/);
  assert.doesNotMatch(open, /root\.loaded = true/);
});
