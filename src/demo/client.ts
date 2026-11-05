// Demo backend: a tiny in-memory stand-in for the Supabase client.
//
// The public demo runs without any server. It implements exactly the subset of the
// supabase-js query builder the app uses (select/eq/neq/gt/order/limit/range, insert,
// upsert, update, delete, auth.getSession …), so every screen runs on the same code path
// as production — only the data source differs. Writes are kept in localStorage, so a
// visitor's clicks survive a reload but never leave the browser.

import { buildFixtures, DEMO_USER, type Row, type Tables } from './fixtures'

const STORAGE_KEY = 'jarvis-demo:v1:db'

type Filter = (row: Row) => boolean
interface Result {
  data: Row[] | null
  error: { message: string } | null
}

function load(): Tables {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { day?: string; tables?: Tables }
      // Fixtures are relative to "today" – rebuild them once a day so the demo never looks stale
      if (parsed.day === new Date().toDateString() && parsed.tables) return parsed.tables
    }
  } catch {
    /* corrupted or blocked storage → fresh fixtures */
  }
  return buildFixtures(new Date())
}

let db: Tables = load()

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ day: new Date().toDateString(), tables: db }))
  } catch {
    /* demo still works, it just forgets on reload */
  }
}

/** Reset the demo to its initial state (used by the "Reset demo" button and tests). */
export function resetDemo(now = new Date()) {
  db = buildFixtures(now)
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

const table = (name: string): Row[] => (db[name] ??= [])
const cmp = (a: unknown, b: unknown) => (a === b ? 0 : a === null || a === undefined ? 1 : b === null || b === undefined ? -1 : String(a) < String(b) ? -1 : 1)
const numCmp = (a: unknown, b: unknown) => (typeof a === 'number' && typeof b === 'number' ? a - b : cmp(a, b))
const conflictKey = (row: Row, cols: string[]) => cols.map((c) => String(row[c])).join('|')

class Query implements PromiseLike<Result> {
  private filters: Filter[] = []
  private sorts: { col: string; asc: boolean; nullsFirst: boolean }[] = []
  private from = 0
  private to = Infinity
  private op: 'select' | 'update' | 'delete' = 'select'
  private patch: Row = {}
  private readonly name: string

  constructor(name: string) {
    this.name = name
  }

  select(_cols?: string) {
    return this
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v)
    return this
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v)
    return this
  }
  gt(col: string, v: unknown) {
    this.filters.push((r) => cmp(r[col], v) > 0)
    return this
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    this.sorts.push({ col, asc: opts.ascending !== false, nullsFirst: opts.nullsFirst ?? false })
    return this
  }
  limit(n: number) {
    this.to = this.from + n - 1
    return this
  }
  range(a: number, b: number) {
    this.from = a
    this.to = b
    return this
  }
  update(patch: Row) {
    this.op = 'update'
    this.patch = patch
    return this
  }
  delete() {
    this.op = 'delete'
    return this
  }

  private run(): Result {
    const rows = table(this.name)
    const match = (r: Row) => this.filters.every((f) => f(r))
    if (this.op === 'update') {
      for (const r of rows) if (match(r)) Object.assign(r, this.patch)
      save()
      return { data: [], error: null }
    }
    if (this.op === 'delete') {
      db[this.name] = rows.filter((r) => !match(r))
      save()
      return { data: [], error: null }
    }
    let out = rows.filter(match)
    if (this.sorts.length)
      out = [...out].sort((a, b) => {
        for (const s of this.sorts) {
          const av = a[s.col]
          const bv = b[s.col]
          if (av == null && bv != null) return s.nullsFirst ? -1 : 1
          if (bv == null && av != null) return s.nullsFirst ? 1 : -1
          const c = numCmp(av, bv)
          if (c) return s.asc ? c : -c
        }
        return 0
      })
    // structuredClone: callers must never mutate the "database" by accident
    return { data: structuredClone(out.slice(this.from, this.to + 1)), error: null }
  }

  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    // Small artificial latency so loading states are visible, like on a real network
    return new Promise<Result>((resolve) => setTimeout(() => resolve(this.run()), 120)).then(ok, fail)
  }
}

function upsert(name: string, input: Row | Row[], opts: { onConflict?: string } = {}): PromiseLike<Result> {
  const cols = (opts.onConflict ?? 'id').split(',').map((c) => c.trim())
  const rows = table(name)
  const now = new Date().toISOString()
  for (const raw of Array.isArray(input) ? input : [input]) {
    const row: Row = { ...raw, user_id: raw.user_id ?? DEMO_USER.id }
    if (name === 'items') row.server_updated_at = now
    if (name === 'news_feedback') row.created_at ??= now
    const key = conflictKey(row, cols)
    const i = rows.findIndex((r) => conflictKey(r, cols) === key)
    if (i >= 0) rows[i] = { ...rows[i], ...row }
    else rows.push(row)
  }
  save()
  return Promise.resolve({ data: [], error: null })
}

const session = { access_token: 'demo', token_type: 'bearer', expires_in: 3600, refresh_token: 'demo', user: DEMO_USER }
type AuthListener = (event: string, s: typeof session | null) => void

/** Drop-in replacement for the parts of SupabaseClient the app uses. */
export function createDemoClient() {
  let signedIn = true
  const listeners = new Set<AuthListener>()
  const emit = (event: string) => listeners.forEach((l) => l(event, signedIn ? session : null))
  return {
    from(name: string) {
      return {
        select: (cols?: string) => new Query(name).select(cols),
        update: (patch: Row) => new Query(name).update(patch),
        delete: () => new Query(name).delete(),
        upsert: (rows: Row | Row[], opts?: { onConflict?: string }) => upsert(name, rows, opts),
        insert: (rows: Row | Row[]) => upsert(name, rows),
      }
    },
    auth: {
      getSession: async () => ({ data: { session: signedIn ? session : null }, error: null }),
      onAuthStateChange(cb: AuthListener) {
        listeners.add(cb)
        return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } }
      },
      // Any credentials work in the demo – there is no account behind it
      async signInWithPassword() {
        signedIn = true
        emit('SIGNED_IN')
        return { data: { session }, error: null }
      },
      async signOut() {
        signedIn = false
        emit('SIGNED_OUT')
        return { error: null }
      },
    },
  }
}
