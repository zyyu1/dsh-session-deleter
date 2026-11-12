window.__ModuleLoader__.load({
  id: "dsh-session-deleter",
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" })

    const react = require("react")
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives")
    const store = require("@deepseek-ai/dsh-client-store")

    const h = react.createElement
    const NS = "session-deleter"
    const PANEL_ID = "session-deleter"
    const CHANNEL = "/session-deleter"

    const zh = {
      "panel.title": "回收站",
      "panel.subtitle": "删除的会话会先放在这里；恢复后回到原工作区，永久删除后不可恢复。",
      "panel.refresh": "刷新",
      "panel.empty": "清空回收站",
      "panel.emptyTitle": "清空回收站",
      "panel.emptyDesc": "将永久删除回收站里的全部会话，此操作不可撤销。",
      "panel.emptyAction": "永久清空",
      "panel.loading": "正在读取…",
      "panel.emptyState": "回收站是空的。",
      "panel.emptyStateHint": "在会话行的「…」菜单里选择「删除会话」即可把会话移到这里。",
      "panel.restore": "恢复",
      "panel.purge": "永久删除",
      "panel.purgeTitle": "永久删除会话",
      "panel.purgeDesc": "将永久删除「{title}」的会话记录，此操作不可撤销。",
      "panel.unknownWorkspace": "未分组",
      "panel.archived": "已归档",
      "panel.deletedAt": "删除于 {time}",
      "panel.size": "{size}",
      "panel.failed": "操作失败：{message}",
      "panel.restored": "已恢复「{title}」。",
      "panel.purged": "已永久删除「{title}」。",
      "panel.emptied": "已清空回收站（{count} 个会话）。",
      "menu.delete": "删除会话",
      "action.delete": "删除会话",
      "confirm.title": "删除会话",
      "confirm.desc": "会话「{title}」的记录将被删除。",
      "confirm.trashNote": "默认移入回收站，可随时恢复；工作区里的其他文件和会话附件不会删除。",
      "confirm.permanent": "永久删除（不进入回收站，无法恢复）",
      "confirm.cancel": "取消",
      "confirm.trash": "移入回收站",
      "confirm.purge": "永久删除",
      "confirm.working": "正在停止会话并删除…",
      "confirm.trashed": "已移入回收站。",
      "confirm.purged": "已永久删除。",
      "confirm.failed": "删除失败：{message}",
      "confirm.openTrash": "查看回收站",
      "error.not-found": "找不到这个会话的记录，可能已经被删除。",
      "error.still-open": "这个会话仍在这个窗口打开，已停止其运行；请先切换到其他会话再删除。",
      "error.agent-busy": "会话仍在运行，未能及时停止；请先手动停止后重试。",
      "error.busy": "这个会话正在被另一个删除操作处理。",
      "error.persistence-unavailable": "会话持久化服务不可用，无法删除。",
      "error.lookup-failed": "定位会话文件失败。",
      "error.unexpected-layout": "会话目录结构异常，已拒绝删除。",
      "error.move-failed": "移入回收站失败，文件可能仍被占用。",
      "error.trash-failed": "写入回收站记录失败，已尝试恢复原状。",
      "error.trash-unavailable": "无法确定会话存储目录，回收站不可用。",
      "error.delete-failed": "删除会话目录失败。",
      "error.entry-missing": "回收站条目不存在。",
      "error.entry-corrupt": "回收站条目已损坏。",
      "error.restore-target-exists": "原位置已存在同名会话目录，无法恢复。",
      "error.restore-failed": "恢复会话文件失败。",
      "error.purge-failed": "永久删除失败。",
      "error.bad-entry": "回收站条目无效。",
      "error.internal": "插件内部错误。",
    }

    const en = {
      "panel.title": "Trash",
      "panel.subtitle": "Deleted sessions wait here. Restoring returns one to its workspace; purging is permanent.",
      "panel.refresh": "Refresh",
      "panel.empty": "Empty trash",
      "panel.emptyTitle": "Empty trash",
      "panel.emptyDesc": "Permanently delete every session in the trash. This cannot be undone.",
      "panel.emptyAction": "Delete all",
      "panel.loading": "Loading…",
      "panel.emptyState": "The trash is empty.",
      "panel.emptyStateHint": "Choose “Delete session” from a session row's “…” menu to move it here.",
      "panel.restore": "Restore",
      "panel.purge": "Delete permanently",
      "panel.purgeTitle": "Delete permanently",
      "panel.purgeDesc": "Delete the stored record of “{title}” for good. This cannot be undone.",
      "panel.unknownWorkspace": "Ungrouped",
      "panel.archived": "Archived",
      "panel.deletedAt": "Deleted {time}",
      "panel.size": "{size}",
      "panel.failed": "Action failed: {message}",
      "panel.restored": "Restored “{title}”.",
      "panel.purged": "Permanently deleted “{title}”.",
      "panel.emptied": "Emptied the trash ({count} sessions).",
      "menu.delete": "Delete session",
      "action.delete": "Delete session",
      "confirm.title": "Delete session",
      "confirm.desc": "The stored record of “{title}” will be deleted.",
      "confirm.trashNote": "It moves to the trash by default and can be restored. Other workspace files and attachments are left alone.",
      "confirm.permanent": "Delete permanently (skip the trash, cannot be undone)",
      "confirm.cancel": "Cancel",
      "confirm.trash": "Move to trash",
      "confirm.purge": "Delete permanently",
      "confirm.working": "Stopping the session and deleting…",
      "confirm.trashed": "Moved to the trash.",
      "confirm.purged": "Permanently deleted.",
      "confirm.failed": "Delete failed: {message}",
      "confirm.openTrash": "Open trash",
      "error.not-found": "No stored record for this session; it may already be deleted.",
      "error.still-open": "This session is still open here. Its work was stopped; switch to another session and try again.",
      "error.agent-busy": "The session is still running and did not stop in time. Stop it and retry.",
      "error.busy": "Another delete is already running for this session.",
      "error.persistence-unavailable": "Session persistence is unavailable, so nothing can be deleted.",
      "error.lookup-failed": "Could not locate the session files.",
      "error.unexpected-layout": "The session directory layout is unexpected; deletion was refused.",
      "error.move-failed": "Could not move the session into the trash; files may still be in use.",
      "error.trash-failed": "Could not write the trash record; the move was rolled back.",
      "error.trash-unavailable": "The session store root is unknown, so the trash is unavailable.",
      "error.delete-failed": "Could not remove the session directory.",
      "error.entry-missing": "That trash entry does not exist.",
      "error.entry-corrupt": "That trash entry is corrupted.",
      "error.restore-target-exists": "A session directory already exists at the original location.",
      "error.restore-failed": "Could not restore the session files.",
      "error.purge-failed": "Could not purge the trash entry.",
      "error.bad-entry": "Invalid trash entry.",
      "error.internal": "Internal plugin error.",
    }

    const css = `
.sd-page{height:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:26px 30px 0;color:var(--dsw-alias-label-primary);min-width:0}
.sd-head{display:flex;align-items:flex-start;gap:12px;flex:none}
.sd-headMain{flex:1;min-width:0}
.sd-title{font-size:20px;line-height:28px;font-weight:600;margin:0}
.sd-sub{margin:4px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}
.sd-headActions{display:flex;align-items:center;gap:8px;flex:none;padding-top:2px}
.sd-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding:2px 2px 26px;margin:0 -2px}
.sd-row{display:flex;align-items:center;gap:12px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;padding:12px 14px;background:var(--dsw-alias-bg-l1,#151a21);min-width:0}
.sd-rowMain{flex:1;min-width:0}
.sd-rowTitle{font-size:14px;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sd-rowMeta{display:flex;align-items:center;gap:8px;margin-top:3px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);min-width:0}
.sd-dot{width:3px;height:3px;border-radius:50%;background:currentColor;flex:none}
.sd-badge{flex:none;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:0 5px;font-size:11px;line-height:16px}
.sd-actions{display:flex;align-items:center;gap:8px;flex:none}
.sd-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:220px;color:var(--dsw-alias-label-tertiary);text-align:center;padding:24px}
.sd-emptyTitle{font-size:14px;color:var(--dsw-alias-label-secondary)}
.sd-emptyHint{font-size:12px;line-height:18px;max-width:360px}
.sd-error{margin-top:12px;font-size:12px;line-height:18px;color:#e5484d}
.sd-success{margin-top:12px;font-size:12px;line-height:18px;color:var(--dsw-alias-state-business-primary,#4a9eff)}
.sd-note{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.sd-check{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary);user-select:none;cursor:pointer}
.sd-check input{width:14px;height:14px;margin:0;accent-color:#e5484d;cursor:pointer}
.sd-danger{color:#e5484d}
.sd-iconButton{cursor:pointer;width:28px;height:28px;flex:none;display:inline-flex;align-items:center;justify-content:center;padding:0;border:none;border-radius:50%;background:transparent;color:var(--dsw-alias-label-secondary)}
.sd-iconButton:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sd-spacer{flex:1}
`

    function formatSize(bytes) {
      const value = Number(bytes)
      if (!Number.isFinite(value) || value <= 0) return ""
      if (value < 1024) return `${String(value)} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      if (value < 1024 * 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`
      return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`
    }

    function formatTime(value) {
      if (typeof value !== "string" || value === "") return ""
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return value
      try {
        return date.toLocaleString()
      } catch {
        return value
      }
    }

    function DeleteMenuItem(props) {
      const { sessionId, useMenuOpenState, openDelete, t } = props
      const [, setMenuOpen] = useMenuOpenState()
      return h(
        primitives.MenuItemButton,
        {
          icon: h(primitives.IconTrashOutlineRegular, { size: 14 }),
          onSelect: () => {
            setMenuOpen(false)
            openDelete(sessionId)
          },
        },
        t("menu.delete"),
      )
    }

    function DeleteRowButton(props) {
      const { sessionId, openDelete, t } = props
      return h(
        primitives.Tooltip,
        {
          label: t("action.delete"),
          side: "bottom",
          align: "end",
          delayMs: 400,
          portal: true,
        },
        h(
          "button",
          {
            type: "button",
            className: "sd-iconButton",
            "aria-label": t("action.delete"),
            onClick: (event) => {
              event.preventDefault()
              event.stopPropagation()
              openDelete(sessionId)
            },
          },
          h(primitives.IconTrashOutlineRegular, { size: 14 }),
        ),
      )
    }

    function DeleteConfirmDialog(props) {
      const { useDeleteRequest, settleDelete, confirmDelete, openTrash, t } = props
      const request = useDeleteRequest((value) => value)
      const [permanent, setPermanent] = react.useState(false)
      const [busy, setBusy] = react.useState(false)
      const [error, setError] = react.useState(null)
      const [done, setDone] = react.useState(null)

      react.useEffect(() => {
        if (request !== null && request !== undefined) {
          setPermanent(false)
          setBusy(false)
          setError(null)
          setDone(null)
        }
      }, [request])

      react.useEffect(() => {
        if (done === null) return undefined
        const timer = setTimeout(() => {
          settleDelete()
        }, 900)
        return () => clearTimeout(timer)
      }, [done])

      if (request === null || request === undefined) return null

      const close = () => {
        if (busy) return
        settleDelete()
      }

      const confirm = () => {
        if (busy) return
        setBusy(true)
        setError(null)
        Promise.resolve()
          .then(() =>
            confirmDelete({
              sessionId: request.sessionId,
              title: request.title,
              permanent,
            }),
          )
          .then((result) => {
            setBusy(false)
            setDone(result.permanent === true ? "purged" : "trashed")
          })
          .catch((reason) => {
            setBusy(false)
            setError(reason)
          })
      }

      const footer = h(
        react.Fragment,
        null,
        h(
          primitives.Button,
          { variant: "outline", disabled: busy, onClick: close },
          t("confirm.cancel"),
        ),
        h(
          primitives.Button,
          {
            variant: "outline",
            disabled: busy || done !== null,
            className: "sd-danger",
            onClick: confirm,
          },
          permanent ? t("confirm.purge") : t("confirm.trash"),
        ),
      )

      return h(
        primitives.Modal,
        {
          open: true,
          onClose: close,
          closeLabel: t("confirm.cancel"),
          title: t("confirm.title"),
          description: t("confirm.desc", { title: request.title }),
          footer,
        },
        h("p", { className: "sd-note" }, t("confirm.trashNote")),
        h(
          "label",
          { className: "sd-check" },
          h("input", {
            type: "checkbox",
            checked: permanent,
            disabled: busy || done !== null,
            onChange: (event) => setPermanent(event.target.checked),
          }),
          t("confirm.permanent"),
        ),
        busy ? h("div", { className: "sd-success", role: "status" }, t("confirm.working")) : null,
        done === null ? null : h("div", { className: "sd-success", role: "status" }, t(done === "purged" ? "confirm.purged" : "confirm.trashed")),
        error === null ? null : h("div", { className: "sd-error", role: "alert" }, t("confirm.failed", { message: reasonText(error, t) })),
        done === null
          ? null
          : h(
              "div",
              { style: { marginTop: "10px" } },
              h(
                primitives.Button,
                {
                  variant: "outline",
                  onClick: () => {
                    settleDelete()
                    openTrash()
                  },
                },
                t("confirm.openTrash"),
              ),
            ),
      )
    }

    function reasonText(reason, t) {
      const code = reason !== null && typeof reason === "object" ? reason.code : undefined
      if (typeof code === "string" && code !== "") {
        const key = `error.${code}`
        const text = t(key)
        if (typeof text === "string" && text !== key) return text
      }
      return reason instanceof Error ? reason.message : String(reason)
    }

    function TrashPanel(props) {
      const { t, useTrash, refreshTrash, restoreTrash, purgeTrash, emptyTrash } = props
      const state = useTrash((value) => value)
      const [busyId, setBusyId] = react.useState(null)
      const [pendingPurge, setPendingPurge] = react.useState(null)
      const [pendingEmpty, setPendingEmpty] = react.useState(false)
      const [notice, setNotice] = react.useState(null)
      const [error, setError] = react.useState(null)

      react.useEffect(() => {
        refreshTrash()
      }, [])

      const entries = state?.entries ?? []
      const loading = state?.phase === "loading" && entries.length === 0
      const shownError = error ?? state?.error ?? null

      const run = (id, action) => {
        setBusyId(id)
        setError(null)
        setNotice(null)
        return action()
          .then((result) => {
            setBusyId(null)
            if (result !== null && result !== undefined) setNotice(result)
          })
          .catch((reason) => {
            setBusyId(null)
            setError(reasonText(reason, t))
          })
      }

      return h(
        "div",
        { className: "sd-page" },
        h(
          "div",
          { className: "sd-head" },
          h(
            "div",
            { className: "sd-headMain" },
            h("h1", { className: "sd-title" }, t("panel.title")),
            h("p", { className: "sd-sub" }, t("panel.subtitle")),
          ),
          h(
            "div",
            { className: "sd-headActions" },
            h(
              primitives.Button,
              { variant: "outline", disabled: loading, onClick: () => run("refresh", refreshTrash) },
              t("panel.refresh"),
            ),
            h(
              primitives.Button,
              {
                variant: "outline",
                className: "sd-danger",
                disabled: entries.length === 0 || busyId !== null,
                onClick: () => setPendingEmpty(true),
              },
              t("panel.empty"),
            ),
          ),
        ),
        notice === null ? null : h("div", { className: "sd-success", role: "status" }, notice),
        shownError === null ? null : h("div", { className: "sd-error", role: "alert" }, shownError),
        loading
          ? h("div", { className: "sd-empty" }, h("div", { className: "sd-emptyTitle" }, t("panel.loading")))
          : entries.length === 0
            ? h(
                "div",
                { className: "sd-empty" },
                h("div", { className: "sd-emptyTitle" }, t("panel.emptyState")),
                h("div", { className: "sd-emptyHint" }, t("panel.emptyStateHint")),
              )
            : h(
                "div",
                { className: "sd-list" },
                entries.map((entry) =>
                  h(
                    "div",
                    { className: "sd-row", key: entry.entryId },
                    h(
                      "div",
                      { className: "sd-rowMain" },
                      h("div", { className: "sd-rowTitle", title: entry.title }, entry.title),
                      h(
                        "div",
                        { className: "sd-rowMeta" },
                        h("span", null, entry.workspaceTitle ?? t("panel.unknownWorkspace")),
                        entry.archived ? h("span", { className: "sd-badge" }, t("panel.archived")) : null,
                        h("span", { className: "sd-dot" }),
                        h("span", null, t("panel.deletedAt", { time: formatTime(entry.deletedAt) })),
                        formatSize(entry.size) === ""
                          ? null
                          : h("span", { className: "sd-dot" }),
                        formatSize(entry.size) === ""
                          ? null
                          : h("span", null, t("panel.size", { size: formatSize(entry.size) })),
                      ),
                    ),
                    h(
                      "div",
                      { className: "sd-actions" },
                      h(
                        primitives.Button,
                        {
                          variant: "outline",
                          disabled: busyId !== null,
                          onClick: () =>
                            run(entry.entryId, () =>
                              restoreTrash(entry.entryId).then(() =>
                                t("panel.restored", { title: entry.title })),
                            ),
                        },
                        t("panel.restore"),
                      ),
                      h(
                        primitives.Button,
                        {
                          variant: "outline",
                          className: "sd-danger",
                          disabled: busyId !== null,
                          onClick: () => setPendingPurge(entry),
                        },
                        t("panel.purge"),
                      ),
                    ),
                  ),
                ),
              ),
        pendingPurge === null
          ? null
          : h(
              primitives.Modal,
              {
                open: true,
                onClose: () => setPendingPurge(null),
                closeLabel: t("confirm.cancel"),
                title: t("panel.purgeTitle"),
                description: t("panel.purgeDesc", { title: pendingPurge.title }),
                footer: h(
                  react.Fragment,
                  null,
                  h(primitives.Button, { variant: "outline", onClick: () => setPendingPurge(null) }, t("confirm.cancel")),
                  h(
                    primitives.Button,
                    {
                      variant: "outline",
                      className: "sd-danger",
                      onClick: () => {
                        const entry = pendingPurge
                        setPendingPurge(null)
                        run(entry.entryId, () =>
                          purgeTrash(entry.entryId).then(() =>
                            t("panel.purged", { title: entry.title })),
                        )
                      },
                    },
                    t("confirm.purge"),
                  ),
                ),
              },
            ),
        pendingEmpty
          ? h(
              primitives.Modal,
              {
                open: true,
                onClose: () => setPendingEmpty(false),
                closeLabel: t("confirm.cancel"),
                title: t("panel.emptyTitle"),
                description: t("panel.emptyDesc"),
                footer: h(
                  react.Fragment,
                  null,
                  h(primitives.Button, { variant: "outline", onClick: () => setPendingEmpty(false) }, t("confirm.cancel")),
                  h(
                    primitives.Button,
                    {
                      variant: "outline",
                      className: "sd-danger",
                      onClick: () => {
                        setPendingEmpty(false)
                        run("empty", () =>
                          emptyTrash().then((count) => t("panel.emptied", { count: String(count) })),
                        )
                      },
                    },
                    t("panel.emptyAction"),
                  ),
                ),
              },
            )
          : null,
      )
    }

    function TrashPanelIcon(props) {
      const size = typeof props?.size === "number" ? props.size : 16
      return h(primitives.IconTrashOutlineRegular, { size })
    }

    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      const request = store.createSnapshotStore(null)
      const trash = store.createSnapshotStore({ phase: "idle", entries: [], error: null })

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), "session-deleter: dictionaries")

      const style = document.createElement("style")
      style.dataset.dshSessionDeleter = ""
      style.textContent = css
      document.head.append(style)
      ctx.effect(() => () => style.remove(), "session-deleter: styles")

      function call(endpoint, payload) {
        const connection = ctx.get("connection")
        if (connection === undefined || connection.rpc === undefined || typeof connection.rpc.call !== "function") {
          throw new Error("connection unavailable")
        }
        return connection.rpc.call(CHANNEL, endpoint, payload)
      }

      async function rpc(endpoint, payload) {
        const result = await call(endpoint, payload)
        if (result === null || typeof result !== "object" || result.ok !== true) {
          const failure = new Error(result?.error?.message ?? "request failed")
          failure.code = result?.error?.code
          throw failure
        }
        return result
      }

      function refreshSessions() {
        try {
          const sessions = ctx.get("sessions")
          const pending = sessions?.refresh?.()
          if (pending !== undefined && typeof pending.catch === "function") pending.catch(() => {})
        } catch {
          // A failed catalog refresh only delays the row disappearing.
        }
      }

      function refreshTrash() {
        trash.set({ ...trash.getSnapshot(), phase: "loading", error: null })
        return rpc("list")
          .then((result) => {
            trash.set({ phase: "ready", entries: result.entries ?? [], error: null })
          })
          .catch((error) => {
            trash.set({ phase: "error", entries: [], error: reasonText(error, t) })
          })
      }

      function openDelete(sessionId) {
        let title = sessionId
        try {
          const summary = ctx.get("sessions")?.list?.getSnapshot()?.byId?.[sessionId]
          if (typeof summary?.displayTitle === "string" && summary.displayTitle !== "") title = summary.displayTitle
        } catch {
          // The id is a usable fallback label.
        }
        request.set({ sessionId, title })
      }

      function settleDelete() {
        request.set(null)
      }

      function confirmDelete(payload) {
        return rpc("delete", payload).then((result) => {
          refreshSessions()
          refreshTrash()
          return result
        })
      }

      function openTrash() {
        try {
          ctx.layout?.selectPanel?.(PANEL_ID)
        } catch {
          // Navigation is best effort.
        }
      }

      function restoreTrash(entryId) {
        return rpc("restore", { entryId }).then((result) => {
          refreshSessions()
          return refreshTrash().then(() => result)
        })
      }

      function purgeTrash(entryId) {
        return rpc("purge", { entryId }).then((result) => refreshTrash().then(() => result))
      }

      function emptyTrash() {
        return rpc("empty").then((result) => refreshTrash().then(() => result.removed ?? 0))
      }

      const menuInjected = () => ({ openDelete })
      const rowInjected = () => ({ openDelete })
      const dialogInjected = () => ({
        hooks: { deleteRequest: request },
        settleDelete,
        confirmDelete,
        openTrash,
      })
      const panelInjected = () => ({
        hooks: { trash },
        refreshTrash,
        restoreTrash,
        purgeTrash,
        emptyTrash,
      })

      ctx.slots.inject("sidebar.workspaces.session.menu.item", () =>
        ctx.slots.register(
          {
            name: "sidebar.workspaces.session.menu.item",
            id: "session-deleter",
            order: 500,
            locale: NS,
            inject: menuInjected,
          },
          DeleteMenuItem,
        ),
      )

      ctx.slots.inject("sidebar.workspaces.session.row.action", () =>
        ctx.slots.register(
          {
            name: "sidebar.workspaces.session.row.action",
            id: "session-deleter",
            order: 300,
            locale: NS,
            inject: rowInjected,
          },
          DeleteRowButton,
        ),
      )

      ctx.slots.inject("shell.overlay", () =>
        ctx.slots.register(
          {
            name: "shell.overlay",
            id: "session-deleter.confirm",
            locale: NS,
            inject: dialogInjected,
          },
          DeleteConfirmDialog,
        ),
      )

      ctx.slots.inject("main", () =>
        ctx.slots.register(
          {
            name: "main",
            key: PANEL_ID,
            locale: NS,
            inject: panelInjected,
          },
          TrashPanel,
        ),
      )

      ctx.slots.inject("sidebar.panellist", () =>
        ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: 10,
            label: () => t("panel.title"),
            locale: NS,
          },
          TrashPanelIcon,
        ),
      )
    }

    const inject = ["slots", "connection", "sessions", "locale", "layout"]
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})
