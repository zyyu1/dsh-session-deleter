# dsh-session-deleter

[中文](README.zh.md) | English

A DSH Web plugin that **deletes sessions** from the sidebar. It stops the live agent, moves the whole session log directory into a recoverable trash, and adds a **Trash** panel to restore, purge or empty it.

DSH itself only archives sessions (hides them); this plugin adds real, undoable deletion.

## Features

- Delete from a session row's "…" menu and from a hover button; works for idle, running, archived and pinned sessions
- Cancels running work and waits for the agent handle to dispose before touching the log, so Windows file locks do not fail the delete
- Moves the session directory to `~/.dsh/session-trash/<sessionId>-<timestamp>/` with `meta.json` (title, original directory, workspace, archived/pinned state, size, deletion time)
- Trash panel in the sidebar: restore to the original workspace (including archived/pinned state), purge one entry, or empty everything
- Confirmation dialog with an explicit "delete permanently" opt-in
- Chinese and English UI
- Attachments and workspace files are left untouched

## Compatibility

Built for `@deepseek-ai/dsh` **0.2.1-rc.5**. It uses the official client slots (`sidebar.workspaces.session.menu.item`, `sidebar.workspaces.session.row.action`, `shell.overlay`, `sidebar.panellist`, `main`) and the official Connection RPC channel, plus these internal shapes: `AgentHandle.dispose`, `sessionPersistence.root` / `findLog()`, `WorkspaceEntity.attachSession/detachSession`.

Inspired by [jasonrale/dsh-archive-manager](https://github.com/jasonrale/dsh-archive-manager), whose 0.1.0-rc.6 client API does not load on 0.2.x.

## Install

Installed on this machine as:

```
~/.dsh/plugins/dsh-session-deleter
~/.dsh/profiles/desktop/node_modules/dsh-session-deleter -> junction to the above
~/.dsh/profiles/desktop/package.json      # "dsh-session-deleter": "link:..."
~/.dsh/profiles/desktop/cordis.patch.yml  # insert row; inject includes webServer
```

To update, overwrite `lib/index.js`, `lib/client.js` and `package.json` in
`~/.dsh/plugins/dsh-session-deleter/`, then reload the page once (Ctrl+R) to
pick up a new client bundle.

For a fresh install: copy this package to `~/.dsh/plugins/`, add the `link:`
dependency to the profile, run `pnpm install`, add the insert row from
`cordis.patch.yml` (with `webServer` in `inject`), and reload.

> `webServer` is required: 0.2.1's `connection.rpc.handle` scopes its channel
> to the Connection service fiber, which does not inject `webServer` and
> therefore always throws. This plugin registers `/session-deleter` directly
> through `ctx.webServer.register` and reuses `ctx.connection.admit()` for
> browser authentication and the Host/Origin fence.

## Data layout

```
~/.dsh/
  sessions/
  session-trash/
    <sessionId>-<timestamp>/
      meta.json
      session/
```

## License

MIT
