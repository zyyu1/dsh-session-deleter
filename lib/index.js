// dsh-session-deleter — host half.
//
// Deletes a DSH session safely:
//   1. build the trash metadata while the session record is still readable;
//   2. stop the live agent and wait (bounded) for its AgentHandle.dispose to
//      settle, so the JSONL log is closed before it is touched;
//   3. move the whole session directory out of the session store into a
//      recoverable trash (or remove it permanently);
//   4. detach the id from workspace accounting, the archive set and the pin
//      set, then tell the browser catalog that the session is gone.
//
// Transport is the official connection RPC channel (`/session-deleter`), so
// browser authentication, Host/Origin fencing and CSRF protection are the
// platform's, not a hand-rolled route's.
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path'

export const name = 'session-deleter'

export const inject = [
  'connection',
  // Reading `ctx.connection.rpc` scopes the channel to this fiber, and the
  // channel registers an exact route on the caller's webServer.
  'webServer',
  'agents',
  'sessionPersistence',
  'workspaceRegistry',
  'sessions',
]

const CHANNEL = '/session-deleter'
const TRASH_DIRNAME = 'session-trash'
const META_FILE = 'meta.json'
const LOG_SUBDIR = 'session'
const META_VERSION = 1

// Windows sometimes keeps a just-closed handle (or a scanner) on the tree for
// a few hundred milliseconds. force:true only suppresses ENOENT, so retry the
// transient sharing violations instead of failing the whole delete.
const RETRY_DELAYS_MS = [0, 150, 350, 700]
const RETRYABLE_CODES = new Set(['EBUSY', 'EPERM', 'EACCES', 'ENOTEMPTY', 'UNKNOWN', 'ETXTBSY'])
// Agent teardown may have to wait for the current turn to cancel. Past this
// budget the delete is refused rather than racing the live writer.
const TEARDOWN_BUDGET_MS = 6000
const TEARDOWN_GRACE_MS = 200
const SESSION_ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/
const ENTRY_ID_PATTERN = /^[A-Za-z0-9._-]{1,220}$/

const ok = (value = {}) => ({ ok: true, ...value })
const fail = (code, message, details) => ({
  ok: false,
  error: { code, message, ...(details === undefined ? {} : { details }) },
})

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms))

const errorCode = (error) =>
  error !== null && typeof error === 'object' && typeof error.code === 'string' ? error.code : undefined

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

async function withRetries(operation, delays = RETRY_DELAYS_MS) {
  let last
  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) await sleep(delays[attempt])
    try {
      return await operation()
    } catch (error) {
      last = error
      const code = errorCode(error)
      if (code === undefined || !RETRYABLE_CODES.has(code) || attempt === delays.length - 1) throw error
    }
  }
  throw last
}

async function removeTree(path) {
  await withRetries(() => rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 }))
}

async function moveTree(source, destination) {
  await mkdir(dirname(destination), { recursive: true })
  await withRetries(async () => {
    try {
      await rename(source, destination)
      return
    } catch (error) {
      const code = errorCode(error)
      // Cross-volume moves and Windows sharing violations fall back to a copy
      // followed by the retrying removal above.
      if (code !== 'EXDEV' && code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY') throw error
    }
    await cp(source, destination, { recursive: true, force: false, errorOnExist: true })
    await removeTree(source)
  })
}

async function directorySize(root) {
  let total = 0
  let seen = 0
  const stack = [root]
  while (stack.length > 0 && seen < 50_000) {
    const current = stack.pop()
    let entries
    try {
      entries = await readdir(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      seen += 1
      const path = join(current, entry.name)
      if (entry.isDirectory()) stack.push(path)
      else if (entry.isFile()) {
        try {
          total += (await stat(path)).size
        } catch {
          // A vanished file simply contributes nothing.
        }
      }
    }
  }
  return total
}

function isInside(root, candidate) {
  const normalizedRoot = resolve(root)
  const normalized = resolve(candidate)
  return normalized === normalizedRoot || normalized.startsWith(`${normalizedRoot}${sep}`)
}

const basename = (path) => path.slice(path.lastIndexOf(sep) + 1)

export function apply(ctx) {
  const registry = ctx.workspaceRegistry
  const persistence = ctx.sessionPersistence
  const disposers = new Map()
  const inflight = new Set()

  /** The configured session store root, when the backend exposes it. */
  const sessionsRoot = typeof persistence?.root === 'string' ? resolve(persistence.root) : undefined
  /** Root of this user's recoverable trash: a sibling of the session store. */
  const trashRoot = sessionsRoot === undefined ? undefined : join(dirname(sessionsRoot), TRASH_DIRNAME)
  const knownTrashRoots = new Set(trashRoot === undefined ? [] : [trashRoot])

  // ── AgentHandle.dispose capture ──
  // rc.5 exposes no agents.stop(id); a live agent is only released by the
  // disposal closure returned from create()/resume(). Wrapping the registry's
  // two entry points is the only capture surface.
  const originalCreate = ctx.agents.create
  const originalResume = ctx.agents.resume
  let patched = false
  try {
    ctx.agents.create = async (options) => {
      const handle = await originalCreate.call(ctx.agents, options)
      remember(handle)
      return handle
    }
    ctx.agents.resume = async (options) => {
      const handle = await originalResume.call(ctx.agents, options)
      remember(handle)
      return handle
    }
    patched = true
  } catch (error) {
    ctx.logger?.warn(`session-deleter: could not capture agent handles: ${messageOf(error)}`)
  }

  function remember(handle) {
    try {
      const id = handle?.agent?.id
      if (typeof id === 'string' && typeof handle.dispose === 'function') disposers.set(id, handle.dispose)
    } catch {
      // A malformed handle only loses the fast teardown path.
    }
  }

  function trashRootForSessionDir(sessionDir) {
    return join(dirname(dirname(sessionDir)), TRASH_DIRNAME)
  }

  /**
   * A backend may not expose its root. Derive the trash location from any
   * session the store already knows: `<root>/<project>/<session>/…`.
   */
  async function ensureRoots() {
    if (knownTrashRoots.size > 0) return
    let id
    try {
      for (const session of ctx.sessions.list?.() ?? []) {
        const candidate = session?.header?.id ?? session?.id
        if (typeof candidate === 'string' && SESSION_ID_PATTERN.test(candidate)) {
          id = candidate
          break
        }
      }
    } catch {
      // No root can be derived.
    }
    if (id === undefined) return
    const located = await locate(id)
    if (located.sessionDir !== undefined) knownTrashRoots.add(trashRootForSessionDir(located.sessionDir))
  }

  async function locate(id) {
    if (persistence === undefined || typeof persistence.findLog !== 'function') {
      return { error: fail('persistence-unavailable', 'Session persistence is not available, so the log cannot be located.') }
    }
    let found
    try {
      found = await persistence.findLog(id)
    } catch (error) {
      return { error: fail('lookup-failed', `Could not locate the session log: ${messageOf(error)}`) }
    }
    if (found === undefined || found === null) return { missing: true }
    const logPath = typeof found === 'string' ? found : found.currentPath ?? found.sourcePath
    if (typeof logPath !== 'string' || logPath === '') {
      return { error: fail('lookup-failed', 'Session persistence returned no log path.') }
    }
    const sessionDir = resolve(dirname(logPath))
    const base = basename(sessionDir)
    if (parse(sessionDir).root === sessionDir || dirname(sessionDir) === sessionDir || !base.includes(id)) {
      return { error: fail('unexpected-layout', `Refusing to touch an unexpected session directory: ${sessionDir}`) }
    }
    return { sessionDir, logPath }
  }

  function locateWorkspace(id) {
    try {
      for (const entity of registry.entities.values()) {
        let ids
        try {
          ids = entity.sessionIds
        } catch {
          continue
        }
        if (Array.isArray(ids) && ids.includes(id)) return entity
      }
    } catch {
      // Best effort: accounting is a convenience, not a safety fence.
    }
    return undefined
  }

  /** Stop whatever the session is doing, then release its agent. */
  async function stopSession(id) {
    try {
      ctx.emit('workspace/session-stop', { sessionId: id })
    } catch {
      // A missing stop provider is not fatal.
    }
    if (ctx.agents.get(id) === undefined) return true
    const disposer = disposers.get(id)
    if (typeof disposer !== 'function') {
      // Hot-loaded plugin: no captured handle. Wait briefly in case the stop
      // provider retires the agent on its own.
      const deadline = Date.now() + 1500
      while (Date.now() < deadline) {
        if (ctx.agents.get(id) === undefined) return true
        await sleep(100)
      }
      return ctx.agents.get(id) === undefined
    }
    let teardown
    try {
      teardown = disposer()
    } catch (error) {
      disposers.delete(id)
      ctx.logger?.warn(`session-deleter: agent teardown for ${id} threw: ${messageOf(error)}`)
      return ctx.agents.get(id) === undefined
    }
    const settled = Promise.resolve(teardown).then(
      () => true,
      () => true,
    )
    const timedOut = await Promise.race([
      settled.then(() => false),
      sleep(TEARDOWN_BUDGET_MS).then(() => true),
    ])
    disposers.delete(id)
    if (timedOut) {
      ctx.logger?.warn(`session-deleter: agent teardown for ${id} did not settle within ${String(TEARDOWN_BUDGET_MS)}ms`)
      return false
    }
    await sleep(TEARDOWN_GRACE_MS)
    return ctx.agents.get(id) === undefined
  }

  /** Drop the id from archive, pin and workspace accounting (all idempotent). */
  async function forgetSession(id) {
    const warnings = []
    if (Array.isArray(registry.archivedSessionIds) && registry.archivedSessionIds.includes(id)) {
      try {
        await registry.unarchiveSession(id)
      } catch (error) {
        warnings.push(`unarchive: ${messageOf(error)}`)
      }
    }
    if (Array.isArray(registry.pinnedSessionIds) && registry.pinnedSessionIds.includes(id)) {
      try {
        await registry.unpinSession(id)
      } catch (error) {
        warnings.push(`unpin: ${messageOf(error)}`)
      }
    }
    try {
      for (const entity of registry.entities.values()) {
        try {
          await entity.detachSession(id)
        } catch (error) {
          warnings.push(`detach ${entity.id}: ${messageOf(error)}`)
        }
      }
    } catch (error) {
      warnings.push(`detach: ${messageOf(error)}`)
    }
    try {
      ctx.emit('api-session/removed', id)
    } catch {
      // The browser also refreshes its catalog after the RPC resolves.
    }
    return warnings
  }

  async function buildMeta(id, sessionDir, options) {
    const entity = locateWorkspace(id)
    let title = typeof options.title === 'string' ? options.title.trim().slice(0, 300) : ''
    if (title === '') {
      try {
        title = ctx.sessions.get(id)?.header?.title ?? ''
      } catch {
        title = ''
      }
    }
    if (title === '') title = id
    const archived = Array.isArray(registry.archivedSessionIds) && registry.archivedSessionIds.includes(id)
    const pinned = Array.isArray(registry.pinnedSessionIds) && registry.pinnedSessionIds.includes(id)
    return {
      version: META_VERSION,
      id,
      title,
      sessionDir,
      workspaceId: entity?.id,
      workspaceTitle: entity?.title,
      archived,
      pinned,
      deletedAt: new Date().toISOString(),
      size: await directorySize(sessionDir),
    }
  }

  async function handleDelete(payload) {
    const id = payload?.sessionId
    if (typeof id !== 'string' || !SESSION_ID_PATTERN.test(id)) {
      return fail('bad-session-id', 'A valid session id is required.')
    }
    if (inflight.has(id)) return fail('busy', 'Another delete is already running for this session.')
    inflight.add(id)
    try {
      const located = await locate(id)
      if (located.error !== undefined) return located.error
      if (located.missing === true) return fail('not-found', 'No stored session log exists for this id.')
      const { sessionDir } = located
      const permanent = payload?.permanent === true
      // Read the durable facts before the agent is torn down and the record
      // stops answering.
      const meta = permanent ? undefined : await buildMeta(id, sessionDir, payload ?? {})

      if (ctx.agents.get(id) !== undefined) {
        const stopped = await stopSession(id)
        if (!stopped) {
          return fail('agent-busy', 'The session is still running; its agent did not stop in time. Try again after stopping it.')
        }
      }
      // A page that still holds the session keeps it live even after teardown.
      if (ctx.sessions.get(id) !== undefined) {
        return fail('still-open', 'The session is still open in this window. Its work was stopped; switch to another session and retry.')
      }

      if (permanent === true) {
        try {
          await removeTree(sessionDir)
        } catch (error) {
          return fail('delete-failed', `Could not delete the session directory: ${messageOf(error)}`)
        }
        const warnings = await forgetSession(id)
        return ok({ permanent: true, sessionId: id, warnings })
      }

      const root = trashRoot ?? trashRootForSessionDir(sessionDir)
      knownTrashRoots.add(root)
      const entryId = `${id}-${Date.now().toString(36)}`
      const entryDir = join(root, entryId)
      const logDir = join(entryDir, LOG_SUBDIR)
      await mkdir(entryDir, { recursive: true })
      try {
        await moveTree(sessionDir, logDir)
      } catch (error) {
        // Roll the empty entry back so the trash never shows a phantom row.
        await removeTree(entryDir).catch(() => {})
        return fail('move-failed', `Could not move the session log into the trash: ${messageOf(error)}`)
      }
      try {
        await writeFile(join(entryDir, META_FILE), `${JSON.stringify(meta, null, 2)}\n`, 'utf8')
      } catch (error) {
        // Without metadata the entry cannot be restored; put the log back.
        try {
          await moveTree(logDir, sessionDir)
          await removeTree(entryDir)
        } catch (rollbackError) {
          ctx.logger?.warn(`session-deleter: rollback after metadata failure also failed: ${messageOf(rollbackError)}`)
        }
        return fail('trash-failed', `Could not write the trash entry: ${messageOf(error)}`)
      }
      knownTrashRoots.add(root)
      const warnings = await forgetSession(id)
      return ok({ permanent: false, sessionId: id, entryId, entry: meta, warnings })
    } finally {
      inflight.delete(id)
    }
  }

  async function readEntry(root, entryId) {
    if (typeof entryId !== 'string' || !ENTRY_ID_PATTERN.test(entryId)) {
      return { error: fail('bad-entry', 'Invalid trash entry id.') }
    }
    const dir = join(root, entryId)
    if (!isInside(root, dir)) return { error: fail('bad-entry', 'Invalid trash entry path.') }
    let raw
    try {
      raw = await readFile(join(dir, META_FILE), 'utf8')
    } catch {
      return { error: fail('entry-missing', 'The trash entry no longer exists.') }
    }
    let meta
    try {
      meta = JSON.parse(raw)
    } catch {
      return { error: fail('entry-corrupt', 'The trash entry metadata is not valid JSON.') }
    }
    if (meta === null || typeof meta !== 'object' || typeof meta.id !== 'string' || typeof meta.sessionDir !== 'string') {
      return { error: fail('entry-corrupt', 'The trash entry metadata is incomplete.') }
    }
    return { entryId, dir, root, logDir: join(dir, LOG_SUBDIR), meta }
  }

  async function findEntry(entryId) {
    if (typeof entryId !== 'string' || !ENTRY_ID_PATTERN.test(entryId)) {
      return { error: fail('bad-entry', 'Invalid trash entry id.') }
    }
    await ensureRoots()
    for (const root of knownTrashRoots) {
      const read = await readEntry(root, entryId)
      if (read.error === undefined) return read
      if (read.error.code !== 'entry-missing') return read
    }
    return { error: fail('entry-missing', 'The trash entry was not found.') }
  }

  async function listRoot(root) {
    let entries
    try {
      entries = await readdir(root, { withFileTypes: true })
    } catch {
      return []
    }
    const rows = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const read = await readEntry(root, entry.name)
      if (read.error !== undefined) continue
      rows.push({
        entryId: read.entryId,
        sessionId: read.meta.id,
        title: typeof read.meta.title === 'string' ? read.meta.title : read.meta.id,
        workspaceTitle: typeof read.meta.workspaceTitle === 'string' ? read.meta.workspaceTitle : undefined,
        deletedAt: typeof read.meta.deletedAt === 'string' ? read.meta.deletedAt : undefined,
        size: Number.isFinite(read.meta.size) ? read.meta.size : 0,
        archived: read.meta.archived === true,
      })
    }
    return rows
  }

  async function handleList() {
    await ensureRoots()
    const rows = []
    for (const root of knownTrashRoots) rows.push(...await listRoot(root))
    rows.sort((left, right) => String(right.deletedAt ?? '').localeCompare(String(left.deletedAt ?? '')))
    return ok({ entries: rows })
  }

  async function handleRestore(payload) {
    const found = await findEntry(payload?.entryId)
    if (found.error !== undefined) return found.error
    const { meta, logDir, dir, root } = found
    const storeRoot = sessionsRoot ?? join(dirname(root), 'sessions')
    if (!isAbsolute(meta.sessionDir) || !isInside(storeRoot, meta.sessionDir)) {
      return fail('bad-entry', 'The recorded session directory is outside the session store; refusing to restore it.')
    }
    try {
      await stat(meta.sessionDir)
      return fail('restore-target-exists', 'A session directory already exists at the original location.')
    } catch {
      // Expected: nothing there.
    }
    try {
      await moveTree(logDir, meta.sessionDir)
    } catch (error) {
      return fail('restore-failed', `Could not move the session log back: ${messageOf(error)}`)
    }
    const warnings = []
    const entity = typeof meta.workspaceId === 'string' ? registry.get(meta.workspaceId) : undefined
    if (entity !== undefined) {
      try {
        await entity.attachSession(meta.id)
      } catch (error) {
        warnings.push(`attach: ${messageOf(error)}`)
      }
    }
    if (meta.archived === true) {
      try {
        await registry.archiveSession(meta.id)
      } catch (error) {
        warnings.push(`archive: ${messageOf(error)}`)
      }
    } else if (meta.pinned === true) {
      try {
        await registry.pinSession(meta.id)
      } catch (error) {
        warnings.push(`pin: ${messageOf(error)}`)
      }
    }
    await removeTree(dir).catch(() => {})
    return ok({ entryId: found.entryId, sessionId: meta.id, warnings })
  }

  async function handlePurge(payload) {
    const found = await findEntry(payload?.entryId)
    if (found.error !== undefined) return found.error
    try {
      await removeTree(found.dir)
    } catch (error) {
      return fail('purge-failed', `Could not remove the trash entry: ${messageOf(error)}`)
    }
    return ok({ entryId: found.entryId })
  }

  async function handleEmpty() {
    await ensureRoots()
    let removed = 0
    const failures = []
    for (const root of knownTrashRoots) {
      let entries
      try {
        entries = await readdir(root, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        try {
          await removeTree(join(root, entry.name))
          removed += 1
        } catch (error) {
          failures.push(`${entry.name}: ${messageOf(error)}`)
        }
      }
    }
    return ok({ removed, failures })
  }

  const dispatch = {
    delete: handleDelete,
    list: handleList,
    restore: handleRestore,
    purge: handlePurge,
    empty: handleEmpty,
    health: async () => ok({
      patched,
      trackedAgents: disposers.size,
      sessionsRoot,
      trashRoot,
    }),
  }

  async function runEndpoint(endpoint, payload) {
    const handler = Object.prototype.hasOwnProperty.call(dispatch, endpoint) ? dispatch[endpoint] : undefined
    if (handler === undefined) return fail('unknown-endpoint', `Unknown endpoint: ${String(endpoint)}`)
    try {
      return await handler(payload ?? {})
    } catch (error) {
      ctx.logger?.warn(`session-deleter: ${endpoint} failed: ${messageOf(error)}`)
      return fail('internal', messageOf(error))
    }
  }

  function sendJson(response, status, body, extraHeaders) {
    const text = JSON.stringify(body)
    response.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': String(Buffer.byteLength(text)),
      ...extraHeaders,
    })
    response.end(text)
  }

  async function readJsonBody(request, limitBytes = 1_048_576) {
    const chunks = []
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > limitBytes) throw new Error('request body too large')
      chunks.push(chunk)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  }

  // `connection.rpc.handle` in 0.2.1 scopes its channel to the Connection
  // service's own fiber, which does not inject `webServer`, so `rpc.handle`
  // always throws. Register the same JSON RPC channel directly on the web
  // server and reuse the platform's admission check (browser cookie + the
  // Host/Origin fence) instead of hand-rolling authentication.
  let disposeRoute
  ctx.inject(['connection', 'webServer'], (scope) => {
    const connection = scope.connection
    if (connection === undefined || typeof scope.webServer?.register !== 'function') return
    const channelPrefix = `${CHANNEL}/`
    const route = {
      kind: 'prefix',
      path: CHANNEL,
      handler: async (request, response) => {
        let admission
        try {
          admission = connection.admit(request)
        } catch (error) {
          response.writeHead(500)
          response.end(`admission failure: ${messageOf(error)}`)
          return
        }
        if (admission !== undefined && 'rejection' in admission) {
          response.writeHead(admission.rejection)
          response.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden')
          return
        }
        if (request.method !== 'POST') {
          response.writeHead(405, { allow: 'POST' })
          response.end()
          return
        }
        const contentType = String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
        if (contentType !== 'application/json') {
          response.writeHead(415)
          response.end('content type must be application/json')
          return
        }
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname
        if (!pathname.startsWith(channelPrefix)) {
          response.writeHead(404)
          response.end('not found')
          return
        }
        const endpoint = pathname.slice(channelPrefix.length)
        let body
        try {
          body = await readJsonBody(request)
        } catch (error) {
          response.writeHead(400)
          response.end(`body is not valid JSON: ${messageOf(error)}`)
          return
        }
        if (
          body === null ||
          typeof body !== 'object' ||
          body.type !== 'client-request' ||
          typeof body.rpcId !== 'string' ||
          typeof body.method !== 'string' ||
          body.method !== endpoint
        ) {
          response.writeHead(400)
          response.end('invalid client-request envelope')
          return
        }
        const result = await runEndpoint(endpoint, body.payload ?? {})
        sendJson(response, 200, { type: 'server-response', rpcId: body.rpcId, result })
      },
    }
    disposeRoute = scope.webServer.register(route)
  })

  return () => {
    try {
      disposeRoute?.()
    } catch {
      // Disposal is already idempotent.
    }
    if (patched) {
      try {
        ctx.agents.create = originalCreate
        ctx.agents.resume = originalResume
      } catch {
        // The fiber teardown restores the service anyway.
      }
    }
    disposers.clear()
    inflight.clear()
    knownTrashRoots.clear()
  }
}

export default { name, inject, apply }
