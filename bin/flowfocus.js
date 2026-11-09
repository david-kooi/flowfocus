#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Model = require('../Model.js');

const help = `Usage: node bin/flowfocus.js [--state FILE] COMMAND
  space create NAME
  space list
  task create TEXT [--space NAME_OR_ID] [--column COLUMN]
  task list [--space NAME_OR_ID]
  task move TASK_ID COLUMN

Columns: backlog, todo (or "to do"), doing, done.
New tasks default to the default space and todo column.
All results are JSON. --state overrides the XDG state file for testing.`;

function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) { console.log(help); return; }
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (!['state', 'space', 'column'].includes(key) || key in options)
        throw new Error(`Unknown or repeated option: ${arg}`);
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
      options[key] = args[++i];
    } else positional.push(arg);
  }
  const [entity, action, ...values] = positional;
  const command = `${entity} ${action}`;
  const counts = { 'space create': 1, 'space list': 0, 'task create': 1, 'task list': 0, 'task move': 2 };
  if (!(command in counts) || values.length !== counts[command]) throw new Error(help);
  if (options.space !== undefined && !['task create', 'task list'].includes(command)) throw new Error('--space is only supported for task create/list');
  if (options.column !== undefined && command !== 'task create') throw new Error('--column is only supported for task create');
  const filename = path.resolve(options.state || path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local/state'), 'omarchy/focusflow.json'));
  const mutate = action !== 'list';
  if (mutate) fs.mkdirSync(path.dirname(filename), { recursive: true });
  const lock = filename + '.cli-lock';
  let locked = false;
  let fd;
  try {
    if (mutate) { fs.mkdirSync(lock); locked = true; }
    let original;
    try { original = fs.readFileSync(filename, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    // Validate without normalizing unrelated timer/settings/task fields.
    const state = original === undefined ? Model.defaultState() : JSON.parse(original);
    if (!Model.parseOrNull(JSON.stringify(state)) || !Array.isArray(state.kanbanProfiles) ||
        !state.kanbanProfiles.some(p => p && p.id === 'default'))
      throw new Error('Invalid or legacy state; open it in FocusFlow before using the CLI');
    function space(selector) {
      const byId = state.kanbanProfiles.find(p => p.id === selector);
      if (byId) return byId;
      const matches = state.kanbanProfiles.filter(p => p.name === selector);
      if (matches.length !== 1) throw new Error(`Space is unknown or ambiguous: ${selector}; use space list and an ID`);
      return matches[0];
    }
    function column(value) {
      const result = value === 'to do' ? 'todo' : value;
      if (!Model.COLUMNS.includes(result)) throw new Error(`Invalid column: ${value}`);
      return result;
    }
    let result;
    if (command === 'space list') result = state.kanbanProfiles;
    if (command === 'space create') {
      const name = values[0].trim();
      if (!name || name.length > 30) throw new Error('Space name must contain 1–30 characters');
      if (state.kanbanProfiles.some(p => p.name === name)) throw new Error('Space name already exists');
      if (state.kanbanProfiles.length >= 20) throw new Error('Space limit reached (20)');
      const active = state.activeKanbanProfileId;
      Model.createKanbanProfile(state, name);
      state.activeKanbanProfileId = active;
      result = state.kanbanProfiles.at(-1);
    }
    if (command === 'task create') {
      const text = values[0].trim();
      if (!text || text.length > 200) throw new Error('Task text must contain 1–200 characters');
      if (state.tasks.length >= 200) throw new Error('Task limit reached (200)');
      const profile = space(options.space === undefined ? 'default' : options.space);
      Model.addTask(state, text, column(options.column === undefined ? 'todo' : options.column), profile.id);
      result = state.tasks.at(-1);
    }
    if (command === 'task list') result = options.space === undefined ? state.tasks : Model.tasksForProfile(state, space(options.space).id);
    if (command === 'task move') {
      result = state.tasks.find(t => t.id === values[0]);
      if (!result) throw new Error(`Unknown task ID: ${values[0]}`);
      Model.moveTask(state, result.id, column(values[1]));
    }
    if (mutate) {
      // Keep the inode: atomic rename breaks the application's file watcher.
      fd = fs.openSync(filename, fs.constants.O_RDWR | (original === undefined ? fs.constants.O_CREAT | fs.constants.O_EXCL : 0) | fs.constants.O_NOFOLLOW, 0o600);
      if (!fs.fstatSync(fd).isFile()) throw new Error('State must be a regular file');
      if (original !== undefined && fs.readFileSync(fd, 'utf8') !== original)
        throw new Error('State changed concurrently; retry the command');
      const data = Buffer.from(Model.serialize(state));
      let offset = 0;
      while (offset < data.length) offset += fs.writeSync(fd, data, offset, data.length - offset, offset);
      fs.ftruncateSync(fd, data.length);
      fs.fsyncSync(fd);
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (locked) fs.rmdirSync(lock);
  }
}

try { main(); }
catch (error) { console.error(`flowfocus: ${error.message}`); process.exitCode = 1; }
