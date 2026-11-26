# Keybindings

Customize keyboard shortcuts in **Settings → Keybindings** on web and desktop. That page lists every available command ID and default binding.

To free a default shortcut, choose **Unassign** from its row menu (**Reset to default** restores it).

> Note: `mod` means `Cmd` on macOS and `Ctrl` on Windows and Linux.

## Common composer shortcuts

| Action                      | Default           | Notes                                                                               |
| --------------------------- | ----------------- | ----------------------------------------------------------------------------------- |
| Start / finish dictation    | `mod+shift+d`     | `Esc` discards. See [Voice input](./voice-input.md).                                |
| Opposite queue/steer action | `mod+Enter`       | Uses the non-default follow-up behavior while a turn runs.                          |
| Start thread in background  | `mod+Alt+Enter`   | Also `mod+Enter` in a new thread; opens a fresh draft immediately.                  |
| Send first queued message   | `mod+Shift+Enter` | Steers if running, or starts a turn if stopped.                                     |
| Pick model                  | `mod+shift+m`     | `mod+shift+up/down` switches providers inside the picker.                           |
| Pick host / environment     | `mod+shift+h`     | Bind **Composer: Cycle Host** to step without a menu.                               |
| Pick effort                 | `mod+shift+e`     | Bind **Increase/Decrease Effort** to step without a menu.                           |
| Pick permissions            | `mod+shift+a`     |                                                                                     |
| Pick workspace mode         | `mod+shift+x`     | Opens the palette on workspace choices; `mod+shift+l` reuses the previous worktree. |
| Pick environment            | `ctrl+x l`        | Opens the palette on environments a new thread can run on.                          |
| Pick Git branch             | `mod+shift+g`     |                                                                                     |

Configure whether `Enter` sends or requires `mod+Enter` in **Settings → Chat → Send shortcut** (`Shift+Enter` always inserts a newline).

**Change model**, **Select workspace**, and **Select environment** are also in the command palette (`Cmd/Ctrl+K`).

In the model picker, use `Left`/`Shift+Tab` to move to the provider list, `Right` to return to search or move into effort levels, and `Up`/`Down`/`Enter` to select.

## Move through lists

In menus, pickers, the command palette, and search results, `Ctrl+N` / `Cmd+N` and `Ctrl+P` / `Cmd+P` move to the next and previous item, like Down and Up. While a list is open they win over New Thread and the file picker. Not configurable.

## Triage and navigate threads

- **Settle / snooze** (`mod+shift+s` / `mod+alt+s`): Both toggle, so the same shortcut un-settles or wakes the thread. Snooze opens a filterable list of wake times; type a duration such as `30m`, `5d`, or `1h 30m`, or choose **Custom…**. A thread waiting on an approval or question cannot be snoozed. The command palette has **Settle thread**, **Un-settle thread**, **Snooze thread**, and **Wake thread**.
- **Previous / next thread** (`mod+shift+[` / `mod+shift+]`): Opens the adjacent sidebar thread.
- **Previous / next needing attention** (`mod+alt+[` / `mod+alt+]`): Skips to the adjacent thread that has stopped working (blocked, failed, or finished, read or not), skipping working, snoozed, and settled threads and wrapping at either end. Needs the default sidebar.
- **Last thread** (`ctrl+b l`): Switches between your two most recent threads (also **Go to last thread** in the palette). On Windows and Linux this chord replaces `Ctrl+B` for toggling the sidebar; rebind either one if you want both.
- **Thread jumps** (`mod+shift+1`–`mod+shift+9`, desktop): Open the first nine threads. On macOS, the system screenshot shortcuts take `cmd+shift+3/4/5` first, so rebind those if needed. On the Usage page they pick the period instead.
- **Half-page scroll** (`Ctrl+D` / `Ctrl+U`): Scrolls the conversation like vim, even while typing in the composer; hold to keep stepping. They use Ctrl on every platform and leave terminal and browser input alone. On Windows and Linux, the diff and Usage shortcuts also default to `Ctrl+D` / `Ctrl+U`, and the later rule wins; rebind **Thread: Scroll Half Page Down/Up**, **Diff: Toggle**, or **Usage: Open** to choose.

## Copy pull request and thread references

- `mod+shift+c`: Copies the open PR's URL (or copies a thread chip link when no PR is open).
- `mod+shift+k`: Copies the open PR's `#number`.

Remap under **Copy Link or Thread** and **Copy Number** in **Settings → Keybindings**.

## Find

- **Current thread** (`chat.find`, default `mod+f` outside terminals/previews): Searches all messages and plans in the thread (requires an up-to-date server). Use `Enter` / `Shift+Enter` to step through matches and `Esc` to close.
- **Diffs** (`mod+f` inside a diff or PR Code tab): Searches all loaded files in the diff, unfolding matching files. Not configurable. Very large uncommitted diffs only search files loaded so far.
- **Browser page** (`preview.find`, default `mod+f` in a desktop browser tab): Searches the open page. If a page handles `mod+f` itself, use the browser's **⋮** menu. Not supported in web clients or streamed browser tabs.

## Hardware keyboards on iPad and Android

- **iPad**: `Cmd+1`–`Cmd+9` open the first nine visible threads; `Cmd+K` opens the command palette (prefix with `>` for actions only); `Cmd+Shift+H` cycles host on a new thread. `Return` sends (`Shift+Return` for newline; `Cmd+Return` for opposite follow-up). Change Return behavior in **Settings → Keyboard**.
- **Android**: Same composer Return behavior using `Ctrl` instead of `Cmd`. The on-screen keyboard's Return always inserts a newline.

## Edit the configuration file

Keybindings are stored on the environment's machine at `~/.t3/userdata/keybindings.json` as a JSON array:

```json
[
  { "key": "mod+g", "command": "terminal.toggle" },
  { "key": "mod+shift+g", "command": "terminal.new", "when": "terminalFocus" }
]
```

New default bindings are added on startup without overwriting customized commands. Invalid rules are ignored; an unparseable file falls back to defaults.

### Rule shape and key syntax

Each rule requires `key` and `command`, plus an optional `when` condition. Project scripts use `script.{id}.run` (e.g. `script.test.run`).

Join modifiers and keys with `+` (`mod`, `cmd`/`meta`, `ctrl`/`control`, `alt`/`option`, `shift`).

### Chords

A chord runs a command from two keys in a row, separated by a space:

```json
{ "key": "mod+g n", "command": "thread.next", "when": "!terminalFocus" }
```

Press `mod+g`, release it, then press `n`. A hint at the top of the window shows the first key while T3 Code waits. `Esc`, any key the chord does not use, or about a second and a half without a key cancels it, and the cancelling key never types into the composer.

- **Recording**: In **Settings → Keybindings**, press a modified first key followed by a plain key to record a chord.
- **Rules**: The first step must include `mod`, `ctrl`, `cmd`, or `alt`. The second step may carry modifiers (`mod+k mod+s`) but cannot be `Esc`. Chords work on web and desktop and never start while the terminal has focus. When a chord's first key matches a plain shortcut, [rule order](#precedence) decides.

### When conditions

Available context keys: `terminalFocus`, `terminalOpen`, `previewFocus`, `previewOpen`, `rightPanelOpen`, `threadTabActive` (a thread tab is showing instead of the conversation), `modelPickerOpen`, `usagePageOpen`, `composerFocus`, `draftThreadRoute`, `turnRunning`, `composerEmpty`, `editableFocus`, `isWeb`, `isDesktop`. Unknown keys evaluate to `false`.

Combine with `!`, `&&`, `||`, and parentheses:

```json
{ "key": "mod+j", "command": "terminal.toggle", "when": "terminalOpen && !terminalFocus" }
```

> Tip: Thread jumps (`mod+shift+1`–`mod+shift+9`) and model picks (`mod+1`–`mod+9` in the model picker) default to `isDesktop` so they don't hijack browser tabs. Remove that condition in Settings if you want them on web.

## Precedence

The last matching rule in `keybindings.json` wins, even across different commands. Place more specific rules after general ones.

## Commands with special behavior

- `thread.stop`: Interrupts the running turn (unbound by default).
- `thread.regenerateTitle`: Regenerates the focused thread's title (unbound by default).
- `thread.undo` (`mod+z`): Undoes recent sidebar actions (unpin, settle, snooze, archive, discard draft) within 5 seconds, including consecutive actions of the same kind.
- `navigation.back` (`mod+[`) / `navigation.forward` (`mod+]`): Moves through visited pages.
- `thread.tab.1`–`thread.tab.9` (`alt+1`–`alt+9`): Switch a thread's [tabs](./thread-sidebar.md#work-in-tabs); `1` is the conversation. They work while a terminal has focus, and a number with no tab leaves the key to the terminal.
- `thread.newTab` (`mod+t`) / `thread.closeTab` (`mod+w`): Open a thread tab or close the one showing. While the right panel is open, `mod+t` adds a right-panel tab instead, unless a terminal has focus.
- `chat.new` / `chat.newLocal` / `chat.newWithoutProject` (`mod+alt+n`): Start new threads using your [new-thread defaults](./thread-sidebar.md#start-a-thread) or [without a project](./thread-sidebar.md#start-without-a-project).

## Reserved and platform shortcuts

- `mod+w` (desktop): Closes the focused terminal, the active thread tab, or the active right-panel tab without closing the window. On web, browsers intercept `mod+w` and `mod+t`—rebind `thread.closeTab`, `rightPanel.close`, and `terminal.close` (e.g. `alt+w`).
- `mod+shift+t`: Reopens the last closed panel tab (files, diffs, PRs, browsers, devices) in order. Browser tabs reopen as fresh sessions. Rebind on web if your browser intercepts it.
- Keep `!terminalFocus` when remapping shortcuts that shouldn't intercept terminal input. `sidebar.toggle` ignores `Ctrl+B` inside terminals so `tmux` keeps its prefix (`Cmd+B` still works on macOS).

## Desktop quit shortcut

`Cmd+Q` (macOS) or `Ctrl+Q` (Windows/Linux) defaults to **Hold** mode: hold for 1.2 seconds or press twice within 500 ms. Change this in **Settings → General → Confirmations → Quit shortcut** to **Direct** or **Double press**. Quitting from the application menu always exits immediately.
