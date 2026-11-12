// Client-bundle smoke test: load the ModuleLoader bundle with fake platform
// modules and fake Cordis client context, then verify every slot registers.
import assert from 'node:assert/strict'

let loaded
globalThis.window = {
  __ModuleLoader__: {
    load: (definition) => {
      loaded = definition
    },
  },
}

const documentStub = {
  createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  head: { append() {} },
}
globalThis.document = documentStub

const reactStub = {
  createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
  Fragment: Symbol('Fragment'),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: (value) => ({ current: value }),
  useSyncExternalStore: (subscribe, get) => get(),
}

const primitives = new Proxy(
  {},
  {
    get(target, key) {
      if (key === 'writeClipboard') return async () => true
      if (!(key in target)) target[key] = () => null
      return target[key]
    },
  },
)

const clientStore = {
  createSnapshotStore: (initial) => {
    let value = initial
    const listeners = new Set()
    return {
      getSnapshot: () => value,
      set: (next) => {
        value = next
        for (const listener of listeners) listener()
      },
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    }
  },
}

const requireStub = (id) => {
  if (id === 'react') return reactStub
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
  if (id === '@deepseek-ai/dsh-client-store') return clientStore
  throw new Error(`unexpected require: ${id}`)
}

await import('../lib/client.js')
assert.ok(loaded, 'bundle registered through __ModuleLoader__')
assert.equal(loaded.id, 'dsh-session-deleter')
const client = loaded.factory(requireStub)
assert.equal(typeof client.apply, 'function')
assert.deepEqual(client.inject, ['slots', 'connection', 'sessions', 'locale', 'layout'])

const registrations = []
const rpcCalls = []
const ctx = {
  locale: {
    bind: () => (key) => key,
    register: () => () => {},
  },
  effect: (fn) => fn(),
  get: (name) =>
    ({
      connection: {
        rpc: {
          call: async (channel, endpoint, payload) => {
            rpcCalls.push([channel, endpoint, payload])
            if (endpoint === 'list') return { ok: true, entries: [] }
            return { ok: true, permanent: false, entryId: 'entry-1', removed: 0 }
          },
        },
      },
      sessions: {
        list: { getSnapshot: () => ({ byId: { 'session-1': { displayTitle: 'Title 1' } } }) },
        refresh: async () => {},
      },
      layout: { selectPanel: () => {} },
    })[name],
  slots: {
    inject: (name, factory) => {
      factory()
      return () => {}
    },
    register: (entry, component) => {
      registrations.push({ entry, component })
      return () => {}
    },
  },
}

client.apply(ctx)

const bySlot = new Map(registrations.map(({ entry, component }) => [entry.name, { entry, component }]))
for (const slot of [
  'sidebar.workspaces.session.menu.item',
  'sidebar.workspaces.session.row.action',
  'shell.overlay',
  'main',
  'sidebar.panellist',
]) {
  assert.ok(bySlot.has(slot), `registered ${slot}`)
}

assert.equal(bySlot.get('sidebar.workspaces.session.menu.item').entry.order, 500)
assert.equal(bySlot.get('sidebar.workspaces.session.row.action').entry.order, 300)
assert.equal(bySlot.get('main').entry.key, 'session-deleter')
assert.equal(bySlot.get('sidebar.panellist').entry.id, 'session-deleter')
assert.equal(bySlot.get('sidebar.panellist').entry.label(), 'panel.title')

// The menu and row components must render without throwing on a minimal share.
for (const slot of ['sidebar.workspaces.session.menu.item', 'sidebar.workspaces.session.row.action']) {
  const { component } = bySlot.get(slot)
  const element = component({
    sessionId: 'session-1',
    t: (key) => key,
    openDelete: () => {},
    useMenuOpenState: () => [false, () => {}],
  })
  assert.ok(element, `${slot} renders`)
}

// The confirm dialog returns null without a request and renders with one.
const dialog = bySlot.get('shell.overlay').component
assert.equal(
  dialog({ useDeleteRequest: (select) => select(null), settleDelete: () => {}, confirmDelete: async () => ({}), openTrash: () => {}, t: (key) => key }),
  null,
)
const opened = dialog({
  useDeleteRequest: (select) => select({ sessionId: 'session-1', title: 'Title 1' }),
  settleDelete: () => {},
  confirmDelete: async () => ({ permanent: false }),
  openTrash: () => {},
  t: (key) => key,
})
assert.ok(opened && opened.type, 'confirm dialog renders')

// The trash panel calls the host list endpoint on mount.
const panel = bySlot.get('main').component
const panelElement = panel({
  t: (key) => key,
  useTrash: (select) => select({ phase: 'ready', entries: [], error: null }),
  refreshTrash: () => Promise.resolve(),
  restoreTrash: () => Promise.resolve(),
  purgeTrash: () => Promise.resolve(),
  emptyTrash: () => Promise.resolve(0),
})
assert.ok(panelElement && panelElement.type, 'trash panel renders')

console.log('client bundle: ok')
