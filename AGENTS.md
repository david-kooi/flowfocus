# Working with FocusFlow

Use the Node.js CLI from this repository to manage application data. Run
`node bin/flowfocus.js --help` for syntax. No npm dependencies are required.
Results are JSON on stdout; failures go to stderr with a nonzero exit status.

## Spaces and tasks

```bash
node bin/flowfocus.js space list
node bin/flowfocus.js space create "Project Alpha"
node bin/flowfocus.js task create "Review proposal" --space "Project Alpha"
node bin/flowfocus.js task create "Buy coffee"
node bin/flowfocus.js task list --space "Project Alpha"
node bin/flowfocus.js task move TASK_ID backlog
node bin/flowfocus.js task move TASK_ID todo
node bin/flowfocus.js task move TASK_ID doing
node bin/flowfocus.js task move TASK_ID done
```

- Omitted `--space` on task creation always means the space with ID `default`,
  regardless of which space is selected in the UI. The initial column is `todo`.
- `--space` accepts an exact space name or ID. Prefer IDs from `space list` when
  names are ambiguous. An unknown space is an error; create it explicitly first.
- `task create` also accepts `--column backlog|todo|doing|done`. `"to do"` is an
  alias for `todo`. Moving out of `done` clears the task's completion flag.
- Use task IDs returned by creation or `task list`; task text need not be unique.
  Unfiltered `task list` returns tasks across all spaces.
- Space creation preserves the selected UI space. Names are limited to 30
  characters, task text to 200; the application supports 20 spaces and 200 tasks.

## Persistence and verification

State defaults to `$XDG_STATE_HOME/omarchy/focusflow.json`, or
`~/.local/state/omarchy/focusflow.json`. `--state FILE` selects an isolated file.
Missing state is initialized; malformed or legacy state is rejected.
Do not manually rewrite live JSON or replace its inode: the app watches this
file. The CLI preserves unrelated fields and writes in place for watcher support.
It locks out other CLI writers and checks for intervening changes, but the QML
app does not share that lock: simultaneous UI/timer writes can still race. For
guaranteed consistency, stop the shell before a batch and start it afterward.
If a `.cli-lock` directory remains after a killed CLI process, verify no CLI is
running before removing that directory.

For code changes, keep model behavior in `Model.js` and reuse it from the CLI.
Run `node --test tests/cli.test.js`. Tests must use temporary state files and
must never touch the user's live application state.
