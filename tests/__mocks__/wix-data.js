let _seq = 0
const store = {}

const wixData = {
  _store: store,
  _reset() { Object.keys(store).forEach(k => delete store[k]); _seq = 0 },

  query(collection) {
    const chain = {
      _filters: [],
      _limit: null,
      _sortField: null,
      _sortDir: 'asc',

      eq(field, value) { this._filters.push({ op: 'eq', field, value }); return this },
      lt(field, value) { this._filters.push({ op: 'lt', field, value }); return this },
      limit(n) { this._limit = n; return this },
      descending(field) { this._sortField = field; this._sortDir = 'desc'; return this },
      ascending(field) { this._sortField = field; this._sortDir = 'asc'; return this },

      _match(item) {
        return this._filters.every(f => {
          if (f.op === 'eq') return item[f.field] === f.value
          if (f.op === 'lt') return new Date(item[f.field]) < new Date(f.value)
          return true
        })
      },

      find() {
        let items = (store[collection] || []).filter(item => chain._match(item))
        if (chain._sortField) {
          items = [...items].sort((a, b) => {
            const av = a[chain._sortField]
            const bv = b[chain._sortField]
            const cmp = av < bv ? -1 : av > bv ? 1 : 0
            return chain._sortDir === 'desc' ? -cmp : cmp
          })
        }
        if (chain._limit !== null) items = items.slice(0, chain._limit)
        return Promise.resolve({ items })
      },

      count() {
        const items = (store[collection] || []).filter(item => chain._match(item))
        return Promise.resolve(items.length)
      },
    }
    return chain
  },

  insert(collection, item) {
    if (!store[collection]) store[collection] = []
    const saved = { ...item, _id: item._id || `mock_${Date.now()}_${++_seq}` }
    store[collection].push(saved)
    return Promise.resolve(saved)
  },

  update(collection, item) {
    const idx = (store[collection] || []).findIndex(i => i._id === item._id)
    if (idx === -1) return Promise.reject(new Error('Item not found'))
    store[collection][idx] = { ...store[collection][idx], ...item }
    return Promise.resolve(store[collection][idx])
  },

  remove(collection, id) {
    if (!store[collection]) return Promise.resolve()
    store[collection] = store[collection].filter(i => i._id !== id)
    return Promise.resolve()
  },
}

module.exports = wixData
