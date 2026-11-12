// Host-half pipeline test: fake Cordis services, real filesystem.
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { apply } from '../lib/index.js'

const root = await mkdtemp(join(tmpdir(), 'dsh-session-deleter-'))
const sessionsRoot = join(root, 'sessions')
const projectDir = join(sessionsRoot, 'proj-a')
const sessionDir = join(projectDir, 'session-test-1')
await mkdir(sessionDir, { recursive: true })
await writeFile(join(sessionDir, 'session.v4.jsonl'), '{"hello":"world"}\n')
await writeFile(join(sessionDir, 'header.json'), '{"id":"session-test-1"}\n')

const events = []
const calls = { detached: [], attached: [], unarchived: [], unpinned: [], archived: [], pinned: [] }

const entity = {
  id: 'ws-1',
  title: 'Project A',
  path: projectDir,
  sessionIds: ['session-test-1'],
  async detachSession(id) {
    calls.detached.push(id)
    this.sessionIds = this.sessionIds.filter((value) => value !== id)
  },
  async attachSession(id) {
    calls.attached.push(id)
    this.sessionIds = [id, ...this.sessionIds]
  },
}

const registry = {
  entities: new Map([[entity.id, entity]]),
  archivedSessionIds: ['session-test-1'],
  pinnedSessionIds: ['session-test-1'],
  get(id) {
    return this.entities.get(id)
  },
  async unarchiveSession(id) {
    calls.unarchived.push(id)
    this.archivedSessionIds = this.archivedSessionIds.filter((value) => value !== id)
  },
  async unpinSession(id) {
    calls.unpinned.push(id)
    this.pinnedSessionIds = this.pinnedSessionIds.filter((value) => value !== id)
  },
  async archiveSession(id) {
    calls.archived.push(id)
    if (!this.archivedSessionIds.includes(id)) this.archivedSessionIds.push(id)
  },
  async pinSession(id) {
    calls.pinned.push(id)
    if (!this.pinnedSessionIds.includes(id)) this.pinnedSessionIds.push(id)
  },
}

const persistence = {
  root: sessionsRoot,
  async findLog(id) {
    if (id !== 'session-test-1') return undefined
    return { currentPath: join(sessionDir, 'session.v4.jsonl'), sourcePath: join(sessionDir, 'session.v4.jsonl'), sourceVersion: 4 }
  },
}

let capturedRoute
const ctx = {
  logger: { warn: () => {} },
  connection: { admit: () => ({}) },
  webServer: {
    register(route) {
      capturedRoute = route
      return () => {
        capturedRoute = undefined
      }
    },
  },
  agents: {
    get: () => undefined,
    async create() { throw new Error('unused') },
    async resume() { throw new Error('unused') },
  },
  sessionPersistence: persistence,
  workspaceRegistry: registry,
  sessions: { get: () => undefined, list: () => [] },
  emit(name, payload) { events.push([name, payload]) },
  effect(fn) { return fn() },
  inject(deps, callback) { callback(this) },
  get(name) { return this[name] },
}

const dispose = apply(ctx)
assert.ok(capturedRoute, 'prefix route registered')
assert.equal(capturedRoute.path, '/session-deleter')
assert.equal(capturedRoute.kind, 'prefix')
assert.equal(typeof dispose, 'function')

const rpc = async (endpoint, payload = {}) => {
  const body = JSON.stringify({ type: 'client-request', rpcId: 'test-id', method: endpoint, payload })
  const request = {
    method: 'POST',
    url: `/session-deleter/${endpoint}`,
    headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body)
    },
  }
  let status
  let text = ''
  const response = {
    writeHead(code) { status = code },
    end(chunk) { if (chunk !== undefined) text = String(chunk) },
  }
  await capturedRoute.handler(request, response)
  assert.equal(status, 200)
  return JSON.parse(text).result
}

const health = await rpc('health', {})
assert.equal(health.ok, true)
assert.equal(health.patched, true)
assert.equal(health.sessionsRoot, sessionsRoot)

// ── move to trash ──
const deleted = await rpc('delete', { sessionId: 'session-test-1', title: 'My session' })
assert.equal(deleted.ok, true, JSON.stringify(deleted))
assert.equal(deleted.permanent, false)
assert.equal(deleted.entry.title, 'My session')
assert.equal(deleted.entry.workspaceId, 'ws-1')
assert.equal(deleted.entry.archived, true)
assert.equal(deleted.entry.pinned, true)
assert.deepEqual(calls.detached, ['session-test-1'])
assert.deepEqual(calls.unarchived, ['session-test-1'])
assert.deepEqual(calls.unpinned, ['session-test-1'])
assert.ok(events.some(([name]) => name === 'api-session/removed'))
await assert.rejects(stat(sessionDir), 'session dir moved away')

const meta = JSON.parse(await readFile(join(root, 'session-trash', deleted.entryId, 'meta.json'), 'utf8'))
assert.equal(meta.id, 'session-test-1')
assert.equal(meta.title, 'My session')
assert.equal(meta.size > 0, true)

// ── list ──
const listed = await rpc('list', {})
assert.equal(listed.ok, true)
assert.equal(listed.entries.length, 1)
assert.equal(listed.entries[0].entryId, deleted.entryId)

// ── restore ──
const restored = await rpc('restore', { entryId: deleted.entryId })
assert.equal(restored.ok, true, JSON.stringify(restored))
assert.deepEqual(restored.warnings, [])
assert.deepEqual(calls.attached, ['session-test-1'])
assert.deepEqual(calls.archived, ['session-test-1'])
assert.equal((await stat(join(sessionDir, 'session.v4.jsonl'))).isFile(), true)
await assert.rejects(stat(join(root, 'session-trash', deleted.entryId)), 'entry removed after restore')

// ── delete and purge ──
const second = await rpc('delete', { sessionId: 'session-test-1' })
assert.equal(second.ok, true)
const purged = await rpc('purge', { entryId: second.entryId })
assert.equal(purged.ok, true)
await assert.rejects(stat(join(root, 'session-trash', second.entryId)))

// ── permanent delete ──
const third = await rpc('delete', { sessionId: 'session-test-1', permanent: true })
assert.equal(third.ok, true)
assert.equal(third.permanent, true)
await assert.rejects(stat(sessionDir))
assert.equal((await rpc('list', {})).entries.length, 0)

// ── error paths ──
assert.equal((await rpc('delete', { sessionId: '../etc' })).error.code, 'bad-session-id')
assert.equal((await rpc('delete', { sessionId: 'session-missing' })).error.code, 'not-found')
assert.equal((await rpc('restore', { entryId: 'nope' })).error.code, 'entry-missing')
assert.equal((await rpc('nope', {})).error.code, 'unknown-endpoint')

dispose()
assert.equal(capturedRoute, undefined, 'route disposed')
await rm(root, { recursive: true, force: true })
console.log('host pipeline: ok')

