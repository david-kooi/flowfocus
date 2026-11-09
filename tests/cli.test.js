const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const Model = require('../Model.js');

test('CLI manages spaces and tasks without changing unrelated state or inode', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowfocus-cli-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  function run(...args) {
    const result = spawnSync(process.execPath, [path.join(__dirname, '../bin/flowfocus.js'), '--state', file, ...args], { encoding: 'utf8' });
    if (result.error) throw result.error;
    return result;
  }
  function ok(...args) {
    const result = run(...args);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  }
  const project = ok('space', 'create', 'Project');
  let state = JSON.parse(fs.readFileSync(file));
  state.activeKanbanProfileId = project.id;
  state.extra = { preserved: true };
  state.timer.remainingSec = 123;
  fs.writeFileSync(file, JSON.stringify(state));
  const inode = fs.statSync(file).ino;
  const defaultTask = ok('task', 'create', 'Default task');
  assert.equal(defaultTask.profileId, 'default');
  const task = ok('task', 'create', 'Project task', '--space', 'Project', '--column', 'backlog');
  assert.equal(task.profileId, project.id);
  for (const col of ['done', 'backlog', 'to do', 'doing']) {
    const moved = ok('task', 'move', task.id, col);
    assert.equal(moved.column, col === 'to do' ? 'todo' : col);
    assert.equal(moved.done, col === 'done');
  }
  assert.equal(ok('task', 'create', 'By ID', '--space', project.id).profileId, project.id);
  assert.equal(ok('task', 'list', '--space', project.id).length, 2);
  assert.equal(ok('space', 'list').length, 2);
  const before = fs.readFileSync(file, 'utf8');
  for (const args of [
    ['task', 'create', 'Bad', '--space', 'missing'],
    ['task', 'move', task.id, 'invalid'],
    ['task', 'move', 'missing', 'done'],
    ['space', 'create', 'Project'],
    ['task', 'create', ' '],
    ['task', 'create', 'x'.repeat(201)],
    ['task', 'create', 'Bad', '--unknown', 'value'],
  ]) assert.equal(run(...args).status, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  state = JSON.parse(before);
  assert.equal(state.activeKanbanProfileId, project.id);
  assert.deepEqual(state.extra, { preserved: true });
  assert.equal(state.timer.remainingSec, 123);
  assert.equal(fs.statSync(file).ino, inode);
  assert.ok(Model.parseOrNull(before));
  fs.mkdirSync(file + '.cli-lock');
  assert.equal(run('task', 'create', 'Locked').status, 1);
  fs.rmdirSync(file + '.cli-lock');
  const full = Model.defaultState();
  for (let i = 0; i < 19; i++) Model.createKanbanProfile(full, `Space ${i}`);
  for (let i = 0; i < 200; i++) Model.addTask(full, `Task ${i}`, 'todo', 'default');
  fs.writeFileSync(file, Model.serialize(full));
  const fullBefore = fs.readFileSync(file, 'utf8');
  assert.equal(run('space', 'create', 'Overflow').status, 1);
  assert.equal(run('task', 'create', 'Overflow').status, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), fullBefore);
  fs.writeFileSync(file, '{broken');
  assert.equal(run('task', 'create', 'Bad').status, 1);
  assert.equal(fs.readFileSync(file, 'utf8'), '{broken');
});
