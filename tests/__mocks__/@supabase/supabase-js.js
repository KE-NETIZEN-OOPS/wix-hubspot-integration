// Use a global store so the same backing data is shared across jest.resetModules() re-requires.
if (!global.__supabaseMockStore) {
  global.__supabaseMockStore = {}
  global.__supabaseMockSeq = 0
}
const store = global.__supabaseMockStore

function makeId() { return `mock_${++global.__supabaseMockSeq}` }
function applyFilters(rows, filters) {
  return rows.filter(row => filters.every(f => {
    if (f.op === 'eq') return String(row[f.col]) === String(f.val)
    if (f.op === 'lt') return new Date(row[f.col]) < new Date(f.val)
    return true
  }))
}
function makeQuery(collection) {
  const q = { _filters: [], _order: null, _limit: null, _single: false, _countMode: false }
  q.select = (cols, opts) => { if (opts && opts.count) q._countMode = true; return q }
  q.eq = (col, val) => { q._filters.push({ op: 'eq', col, val }); return q }
  q.lt = (col, val) => { q._filters.push({ op: 'lt', col, val }); return q }
  q.order = (col, opts = {}) => { q._order = { col, desc: opts.ascending === false }; return q }
  q.limit = (n) => { q._limit = n; return q }
  q.single = () => { q._single = true; return q }
  q.then = (resolve) => {
    const rows = store[collection] || []
    let result = applyFilters(rows, q._filters)
    if (q._order) {
      result = [...result].sort((a, b) => {
        const av = a[q._order.col], bv = b[q._order.col]
        return q._order.desc ? (av < bv ? 1 : -1) : (av > bv ? 1 : -1)
      })
    }
    if (q._limit) result = result.slice(0, q._limit)
    if (q._single) {
      if (result.length === 0) return resolve({ data: null, error: { code: 'PGRST116' } })
      return resolve({ data: result[0], error: null })
    }
    return resolve({ data: result, error: null, count: result.length })
  }
  return q
}
const client = {
  get _store() { return store },
  _reset() { Object.keys(store).forEach(k => delete store[k]); global.__supabaseMockSeq = 0 },
  from(collection) {
    return {
      select: (cols, opts) => makeQuery(collection).select(cols, opts),
      insert: (row) => {
        if (!store[collection]) store[collection] = []
        const saved = { ...row, id: row.id || makeId(), created_at: new Date().toISOString() }
        store[collection].push(saved)
        return Promise.resolve({ data: saved, error: null })
      },
      update: (updates) => ({
        eq: (col, val) => {
          const rows = store[collection] || []
          const idx = rows.findIndex(r => String(r[col]) === String(val))
          if (idx >= 0) rows[idx] = { ...rows[idx], ...updates }
          return Promise.resolve({ data: rows[idx] || null, error: null })
        },
      }),
      upsert: (row, opts) => {
        if (!store[collection]) store[collection] = []
        const onConflict = opts && opts.onConflict
        const existingIdx = onConflict ? store[collection].findIndex(r => String(r[onConflict]) === String(row[onConflict])) : -1
        if (existingIdx >= 0) {
          store[collection][existingIdx] = { ...store[collection][existingIdx], ...row }
          return Promise.resolve({ data: store[collection][existingIdx], error: null })
        }
        const saved = { ...row, created_at: new Date().toISOString() }
        store[collection].push(saved)
        return Promise.resolve({ data: saved, error: null })
      },
      delete: () => {
        const ops = {}
        const doDelete = (filterFn) => {
          if (store[collection]) store[collection] = store[collection].filter(r => !filterFn(r))
          return Promise.resolve({ error: null })
        }
        ops.eq = (col, val) => doDelete(r => String(r[col]) === String(val))
        ops.lt = (col, val) => doDelete(r => new Date(r[col]) < new Date(val))
        ops.match = (conds) => doDelete(r => Object.entries(conds).every(([k, v]) => r[k] === v))
        return ops
      },
    }
  }
}
module.exports = { createClient: jest.fn(() => client), _mockClient: client }
